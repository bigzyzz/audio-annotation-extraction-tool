import type { AudioFile } from "@audio-tool/shared-types";
import { supabase } from "./lib/supabase.js";
import {
  downloadAudioToTemp,
  removeTempAudioDir,
} from "./lib/audio-temp.js";
import { probeAudio } from "./lib/ffmpeg.js";
import { writePeaksForAudioFile } from "./peaks.js";

const BATCH_LIMIT = 5;
const MAX_FAILURES = 3;

const failures = new Map<string, number>();

type UnprobedFile = Pick<
  AudioFile,
  "id" | "owner_id" | "storage_path" | "format" | "filename"
>;

async function fetchUnprobedFiles(): Promise<UnprobedFile[]> {
  const { data, error } = await supabase
    .from("audio_files")
    .select("id, owner_id, storage_path, format, filename")
    .is("duration_seconds", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) throw error;
  return data ?? [];
}

async function recordMetadata(
  id: string,
  durationSeconds: number,
  sampleRate: number,
): Promise<void> {
  const { error } = await supabase
    .from("audio_files")
    .update({
      duration_seconds: durationSeconds,
      sample_rate: sampleRate,
    })
    .eq("id", id)
    .is("duration_seconds", null);

  if (error) throw error;
}

async function probeOne(file: UnprobedFile): Promise<void> {
  let tempPath: string | null = null;
  try {
    tempPath = await downloadAudioToTemp(file);
    const meta = await probeAudio(tempPath);

    if (!Number.isFinite(meta.durationSeconds) || meta.durationSeconds < 0) {
      throw new Error("ffprobe returned no duration");
    }
    if (!Number.isFinite(meta.sampleRate) || meta.sampleRate <= 0) {
      throw new Error("ffprobe returned no sample rate");
    }

    const durationSeconds = Number(meta.durationSeconds.toFixed(3));
    const sampleRate = Math.round(meta.sampleRate);

    await recordMetadata(file.id, durationSeconds, sampleRate);
    await writePeaksForAudioFile(
      { id: file.id, owner_id: file.owner_id },
      tempPath,
      { sampleRate, durationSeconds },
    );
    failures.delete(file.id);
    console.log(
      `[worker] probed ${file.id} duration=${durationSeconds}s sample_rate=${sampleRate}`,
    );
  } finally {
    if (tempPath) {
      await removeTempAudioDir(tempPath);
    }
  }
}

function shouldSkip(id: string): boolean {
  return (failures.get(id) ?? 0) >= MAX_FAILURES;
}

function rememberFailure(id: string, err: unknown): void {
  const count = (failures.get(id) ?? 0) + 1;
  failures.set(id, count);
  console.error(
    `[worker] probe failed ${id} (${count}/${MAX_FAILURES}):`,
    err,
  );
}

/** Fill duration_seconds + sample_rate for rows the browser left null. */
export async function probePendingAudioFiles(): Promise<void> {
  const files = (await fetchUnprobedFiles()).filter((file) => !shouldSkip(file.id));
  if (files.length === 0) return;

  console.log(`[worker] probing ${files.length} file(s)`);
  for (const file of files) {
    try {
      await probeOne(file);
    } catch (err) {
      rememberFailure(file.id, err);
    }
  }
}
