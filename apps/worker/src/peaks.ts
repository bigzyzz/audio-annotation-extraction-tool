import type { AudioFile } from "@audio-tool/shared-types";
import { waveformPeaksStoragePath } from "@audio-tool/shared-types";
import {
  downloadAudioToTemp,
  removeTempAudioDir,
} from "./lib/audio-temp.js";
import { supabase } from "./lib/supabase.js";
import { generateWaveformPeaksFromFile } from "./lib/waveform-peaks.js";

const AUDIO_BUCKET = "audio";
const BATCH_LIMIT = 5;
const MAX_FAILURES = 3;

const failures = new Map<string, number>();

type PeaksTarget = Pick<
  AudioFile,
  "id" | "owner_id" | "storage_path" | "format"
> & {
  sample_rate: number;
  duration_seconds: number;
};

type PeaksMeta = {
  sampleRate: number;
  durationSeconds: number;
};

export async function writePeaksForAudioFile(
  file: Pick<AudioFile, "id" | "owner_id">,
  tempPath: string,
  meta: PeaksMeta,
): Promise<void> {
  const peaks = await generateWaveformPeaksFromFile(tempPath, meta);
  const peaksPath = waveformPeaksStoragePath(file.owner_id, file.id);
  await uploadPeaksJson(peaksPath, peaks);
  await recordWaveformPeaksPath(file.id, peaksPath);
  failures.delete(file.id);
  console.log(`[worker] peaks ${file.id} path=${peaksPath} count=${peaks.peaks.length}`);
}

async function uploadPeaksJson(
  storagePath: string,
  peaks: object,
): Promise<void> {
  const body = JSON.stringify(peaks);
  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(
    storagePath,
    body,
    {
      contentType: "application/json",
      upsert: true,
    },
  );

  if (error) throw error;
}

async function recordWaveformPeaksPath(
  id: string,
  peaksPath: string,
): Promise<void> {
  const { error } = await supabase
    .from("audio_files")
    .update({ waveform_peaks_path: peaksPath })
    .eq("id", id)
    .is("waveform_peaks_path", null);

  if (error) throw error;
}

async function fetchPendingPeaksFiles(): Promise<PeaksTarget[]> {
  const { data, error } = await supabase
    .from("audio_files")
    .select(
      "id, owner_id, storage_path, format, sample_rate, duration_seconds",
    )
    .not("duration_seconds", "is", null)
    .is("waveform_peaks_path", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) throw error;

  return (data ?? []).filter(
    (file): file is PeaksTarget =>
      file.sample_rate != null && file.duration_seconds != null,
  );
}

function shouldSkip(id: string): boolean {
  return (failures.get(id) ?? 0) >= MAX_FAILURES;
}

function rememberFailure(id: string, err: unknown): void {
  const count = (failures.get(id) ?? 0) + 1;
  failures.set(id, count);
  console.error(
    `[worker] peaks failed ${id} (${count}/${MAX_FAILURES}):`,
    err,
  );
}

async function generatePeaksOne(file: PeaksTarget): Promise<void> {
  let tempPath: string | null = null;
  try {
    tempPath = await downloadAudioToTemp(file);
    await writePeaksForAudioFile(
      { id: file.id, owner_id: file.owner_id },
      tempPath,
      {
        sampleRate: file.sample_rate,
        durationSeconds: Number(file.duration_seconds),
      },
    );
  } finally {
    if (tempPath) {
      await removeTempAudioDir(tempPath);
    }
  }
}

/** Backfill waveform_peaks_path for probed rows (and any probe skipped peaks). */
export async function generatePendingWaveformPeaks(): Promise<void> {
  const files = (await fetchPendingPeaksFiles()).filter(
    (file) => !shouldSkip(file.id),
  );
  if (files.length === 0) return;

  console.log(`[worker] generating peaks for ${files.length} file(s)`);
  for (const file of files) {
    try {
      await generatePeaksOne(file);
    } catch (err) {
      rememberFailure(file.id, err);
    }
  }
}
