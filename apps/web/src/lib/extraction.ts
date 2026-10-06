/**
 * R4 / T19: Extraction client & signed download helpers (US10, US11, US12).
 * Validates extraction ranges, creates extraction jobs in Postgres, fetches
 * extraction history, and generates signed download URLs from Storage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExtractionJob } from "@audio-tool/shared-types";

export const AUDIO_BUCKET = "audio";
export const SIGNED_EXTRACTION_URL_TTL_SECONDS = 3600; // 1 hour

export const EXTRACTION_ERRORS = {
  login: "You need to log in to extract audio.",
  invalidFileId: "Invalid audio file identifier.",
  invalidTimes: "Start and end times must be valid numbers.",
  negativeStart: "Start time must be non-negative.",
  endBeforeStart: "End time must be after start time.",
  tooShort: "Segment duration must be at least 0.05 seconds.",
  exceedsDuration: "Start time exceeds track duration.",
  invalidPath: "Invalid extraction storage path.",
  createJob: "Couldn't request extraction. Please try again.",
  fetchJobs: "Couldn't fetch extraction jobs.",
  downloadUrl: "Couldn't generate download link for extracted audio.",
} as const;

export type RequestExtractionJobInput = {
  audioFileId: string;
  startSeconds: number;
  endSeconds: number;
  totalDurationSeconds?: number | null;
};

export type RequestExtractionResult =
  | { ok: true; job: ExtractionJob }
  | { ok: false; error: string };

export type GetExtractionJobsResult =
  | { ok: true; jobs: ExtractionJob[] }
  | { ok: false; error: string };

export type ExtractionDownloadUrls = {
  audioUrl: string;
  metadataUrl: string | null;
};

export type ExtractionDownloadUrlsResult =
  | { ok: true; urls: ExtractionDownloadUrls }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXTRACTION_AUDIO_PATH_RE =
  /^extractions\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp3|wav)$/i;

export function roundExtractionTime(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

export function validateExtractionTimes(
  startSeconds: number,
  endSeconds: number,
  totalDurationSeconds?: number | null,
): { ok: true; duration: number } | { ok: false; error: string } {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return { ok: false, error: EXTRACTION_ERRORS.invalidTimes };
  }

  if (startSeconds < 0) {
    return { ok: false, error: EXTRACTION_ERRORS.negativeStart };
  }

  if (endSeconds <= startSeconds) {
    return { ok: false, error: EXTRACTION_ERRORS.endBeforeStart };
  }

  const duration = Number((endSeconds - startSeconds).toFixed(3));
  if (duration < 0.05) {
    return { ok: false, error: EXTRACTION_ERRORS.tooShort };
  }

  if (
    totalDurationSeconds != null &&
    Number.isFinite(totalDurationSeconds) &&
    totalDurationSeconds > 0
  ) {
    if (startSeconds >= totalDurationSeconds) {
      return { ok: false, error: EXTRACTION_ERRORS.exceedsDuration };
    }
  }

  return { ok: true, duration };
}

export function validateExtractionStoragePath(
  path: string,
): { ok: true; audioPath: string; metadataPath: string } | { ok: false; error: string } {
  const trimmed = path.trim();
  if (!trimmed || !EXTRACTION_AUDIO_PATH_RE.test(trimmed)) {
    return { ok: false, error: EXTRACTION_ERRORS.invalidPath };
  }

  const metadataPath = trimmed.replace(/\.(mp3|wav)$/i, ".annotations.json");
  return { ok: true, audioPath: trimmed, metadataPath };
}

export async function requestExtractionJob(
  supabase: SupabaseClient<Database>,
  input: RequestExtractionJobInput,
): Promise<RequestExtractionResult> {
  const { audioFileId, startSeconds, endSeconds, totalDurationSeconds } = input;

  if (!UUID_RE.test(audioFileId)) {
    return { ok: false, error: EXTRACTION_ERRORS.invalidFileId };
  }

  const timeValidation = validateExtractionTimes(
    startSeconds,
    endSeconds,
    totalDurationSeconds,
  );
  if (!timeValidation.ok) {
    return timeValidation;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: EXTRACTION_ERRORS.login };
  }

  const { data, error } = await supabase
    .from("extraction_jobs")
    .insert({
      audio_file_id: audioFileId,
      requested_by: user.id,
      start_seconds: roundExtractionTime(startSeconds),
      end_seconds: roundExtractionTime(endSeconds),
      status: "pending",
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? EXTRACTION_ERRORS.createJob };
  }

  return { ok: true, job: data };
}

export async function getExtractionJobs(
  supabase: SupabaseClient<Database>,
  audioFileId: string,
): Promise<GetExtractionJobsResult> {
  if (!UUID_RE.test(audioFileId)) {
    return { ok: false, error: EXTRACTION_ERRORS.invalidFileId };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: EXTRACTION_ERRORS.login };
  }

  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("*")
    .eq("audio_file_id", audioFileId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, error: error.message ?? EXTRACTION_ERRORS.fetchJobs };
  }

  return { ok: true, jobs: data ?? [] };
}

export async function createExtractionDownloadUrls(
  supabase: SupabaseClient<Database>,
  outputPath: string,
): Promise<ExtractionDownloadUrlsResult> {
  const pathValidation = validateExtractionStoragePath(outputPath);
  if (!pathValidation.ok) {
    return pathValidation;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: EXTRACTION_ERRORS.login };
  }

  const [audioRes, metaRes] = await Promise.all([
    supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(pathValidation.audioPath, SIGNED_EXTRACTION_URL_TTL_SECONDS),
    supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(pathValidation.metadataPath, SIGNED_EXTRACTION_URL_TTL_SECONDS),
  ]);

  if (audioRes.error || !audioRes.data?.signedUrl) {
    return {
      ok: false,
      error: audioRes.error?.message ?? EXTRACTION_ERRORS.downloadUrl,
    };
  }

  return {
    ok: true,
    urls: {
      audioUrl: audioRes.data.signedUrl,
      metadataUrl: metaRes.data?.signedUrl ?? null,
    },
  };
}
