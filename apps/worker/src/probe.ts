import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AudioFile } from "@audio-tool/shared-types";
import { supabase } from "./lib/supabase.js";
import { probeAudio } from "./lib/ffmpeg.js";

const AUDIO_BUCKET = "audio";
const BATCH_LIMIT = 5;
const MAX_FAILURES = 3;

const failures = new Map<string, number>();

type UnprobedFile = Pick<
  AudioFile,
  "id" | "storage_path" | "format" | "filename"
>;

async function fetchUnprobedFiles(): Promise<UnprobedFile[]> {
  const { data, error } = await supabase
    .from("audio_files")
    .select("id, storage_path, format, filename")
    .is("duration_seconds", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) throw error;
  return data ?? [];
}

async function downloadToTemp(file: UnprobedFile): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .download(file.storage_path);

  if (error || !data) {
    throw new Error(error?.message ?? "Storage download returned no data");
  }

  const dir = await mkdtemp(join(tmpdir(), "audio-probe-"));
  const ext = file.format === "wav" ? "wav" : "mp3";
  const filePath = join(dir, `${file.id}.${ext}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await writeFile(filePath, bytes);
  return filePath;
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
    tempPath = await downloadToTemp(file);
    const meta = await probeAudio(tempPath);

    if (!Number.isFinite(meta.durationSeconds) || meta.durationSeconds < 0) {
      throw new Error("ffprobe returned no duration");
    }
    if (!Number.isFinite(meta.sampleRate) || meta.sampleRate <= 0) {
      throw new Error("ffprobe returned no sample rate");
    }

    await recordMetadata(
      file.id,
      Number(meta.durationSeconds.toFixed(3)),
      Math.round(meta.sampleRate),
    );
    failures.delete(file.id);
    console.log(
      `[worker] probed ${file.id} duration=${meta.durationSeconds}s sample_rate=${meta.sampleRate}`,
    );
  } finally {
    if (tempPath) {
      await rm(dirname(tempPath), { recursive: true, force: true });
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
