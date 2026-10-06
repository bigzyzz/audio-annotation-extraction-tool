import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AudioFile, ExtractionJob } from "@audio-tool/shared-types";
import {
  extractionMetadataStoragePath,
  extractionStoragePath,
} from "@audio-tool/shared-types";
import {
  buildAnnotationMetadataDocument,
  extractLosslessSegment,
  type AnnotationItem,
  type AudioFormat,
} from "./extract.js";
import {
  downloadAudioToTemp,
  removeTempAudioDir,
} from "./lib/audio-temp.js";
import { supabase } from "./lib/supabase.js";

const AUDIO_BUCKET = "audio";
const BATCH_LIMIT = 5;

export interface ExtractionJobTarget {
  id: string;
  audio_file_id: string;
  start_seconds: number;
  end_seconds: number;
}

export interface ProcessJobResult {
  jobId: string;
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Atomically transitions an extraction job from 'pending' to 'processing'.
 * Returns the claimed job if successful, or null if the job was already claimed or updated.
 */
export async function claimExtractionJob(
  jobId: string,
): Promise<ExtractionJob | null> {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .update({
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    console.error(`[worker] error claiming job ${jobId}:`, error);
    return null;
  }

  return data;
}

/**
 * Fetches pending jobs from the database ordered by oldest creation date.
 */
export async function fetchPendingExtractionJobs(
  limit = BATCH_LIMIT,
): Promise<ExtractionJob[]> {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Updates an extraction job's status to 'failed' with a diagnostic error message.
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("extraction_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error(`[worker] failed to mark job ${jobId} as failed:`, error);
  }
}

/**
 * Updates an extraction job's status to 'completed' with the Storage output path.
 */
export async function markJobCompleted(
  jobId: string,
  outputPath: string,
): Promise<void> {
  const { error } = await supabase
    .from("extraction_jobs")
    .update({
      status: "completed",
      output_path: outputPath,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error(`[worker] failed to mark job ${jobId} as completed:`, error);
    throw error;
  }
}

/**
 * Uploads a file buffer or string payload to Supabase Storage in the audio bucket.
 */
async function uploadToAudioStorage(
  storagePath: string,
  content: Buffer | string,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(
    storagePath,
    content,
    {
      contentType,
      upsert: true,
    },
  );

  if (error) {
    throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
  }
}

/**
 * Processes a single extraction job end-to-end:
 * 1. Atomically claims job (pending -> processing).
 * 2. Fetches audio file record and annotations.
 * 3. Downloads source audio to a temp directory.
 * 4. Calls T17 lossless audio cutting engine.
 * 5. Generates sidecar annotation metadata JSON document.
 * 6. Uploads extracted audio segment & metadata JSON to Storage.
 * 7. Marks job as completed.
 */
export async function processExtractionJob(
  job: ExtractionJob,
): Promise<ProcessJobResult> {
  // Step 1: Atomically claim
  const claimed = await claimExtractionJob(job.id);
  if (!claimed) {
    return {
      jobId: job.id,
      success: false,
      error: "Job already claimed or no longer pending",
    };
  }

  let tempSourcePath: string | null = null;

  try {
    // Step 2: Fetch audio file details
    const { data: fileData, error: fileError } = await supabase
      .from("audio_files")
      .select("id, owner_id, filename, format, storage_path, duration_seconds")
      .eq("id", claimed.audio_file_id)
      .maybeSingle();

    if (fileError || !fileData) {
      const msg = "Associated audio file not found";
      await markJobFailed(claimed.id, msg);
      return { jobId: claimed.id, success: false, error: msg };
    }

    const audioFile: Pick<
      AudioFile,
      "id" | "owner_id" | "filename" | "format" | "storage_path" | "duration_seconds"
    > = fileData;

    // Step 3: Fetch annotations for this file
    const { data: noteData, error: noteError } = await supabase
      .from("annotations")
      .select("id, start_seconds, end_seconds, label, comment")
      .eq("audio_file_id", audioFile.id)
      .order("start_seconds", { ascending: true });

    if (noteError) {
      console.warn(
        `[worker] warning fetching annotations for ${audioFile.id}:`,
        noteError,
      );
    }

    const annotations: AnnotationItem[] = (noteData ?? []).map((note) => ({
      id: note.id,
      start_seconds: Number(note.start_seconds),
      end_seconds:
        note.end_seconds != null ? Number(note.end_seconds) : null,
      label: note.label,
      comment: note.comment,
    }));

    // Step 4: Download source audio to temp workspace
    tempSourcePath = await downloadAudioToTemp(audioFile);

    const format: AudioFormat = audioFile.format === "wav" ? "wav" : "mp3";
    const localCutFilename = `${claimed.id}.${format}`;
    const localCutPath = join(dirname(tempSourcePath), localCutFilename);

    const startSeconds = Number(claimed.start_seconds);
    const endSeconds = Number(claimed.end_seconds);

    // Step 5: Perform lossless cut (req R8)
    await extractLosslessSegment({
      inputPath: tempSourcePath,
      outputPath: localCutPath,
      startSeconds,
      endSeconds,
      format,
      totalDurationSeconds: audioFile.duration_seconds,
    });

    // Step 6: Generate annotation metadata JSON document (req R4)
    const metadataDoc = buildAnnotationMetadataDocument(annotations, {
      sourceAudioFileId: audioFile.id,
      sourceFilename: audioFile.filename,
      startSeconds,
      endSeconds,
      format,
    });

    // Step 7: Upload output audio & metadata sidecar to Storage
    const outputAudioPath = extractionStoragePath(
      audioFile.id,
      claimed.id,
      format,
    );
    const outputMetaPath = extractionMetadataStoragePath(
      audioFile.id,
      claimed.id,
    );

    const cutAudioBytes = await readFile(localCutPath);
    const audioContentType =
      format === "wav" ? "audio/wav" : "audio/mpeg";

    await uploadToAudioStorage(outputAudioPath, cutAudioBytes, audioContentType);
    await uploadToAudioStorage(
      outputMetaPath,
      JSON.stringify(metadataDoc, null, 2),
      "application/json",
    );

    // Step 8: Mark job completed
    await markJobCompleted(claimed.id, outputAudioPath);

    console.log(
      `[worker] extraction completed: job=${claimed.id} output=${outputAudioPath}`,
    );

    return {
      jobId: claimed.id,
      success: true,
      outputPath: outputAudioPath,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Extraction processing failed";
    console.error(`[worker] extraction failed for job ${claimed.id}:`, err);
    await markJobFailed(claimed.id, errorMsg);
    return {
      jobId: claimed.id,
      success: false,
      error: errorMsg,
    };
  } finally {
    if (tempSourcePath) {
      await removeTempAudioDir(tempSourcePath);
    }
  }
}

/**
 * Polls and processes all pending extraction jobs up to BATCH_LIMIT.
 */
export async function processPendingExtractionJobs(): Promise<number> {
  const jobs = await fetchPendingExtractionJobs();
  if (jobs.length === 0) {
    return 0;
  }

  console.log(`[worker] processing ${jobs.length} pending extraction job(s)`);

  let completedCount = 0;
  for (const job of jobs) {
    const result = await processExtractionJob(job);
    if (result.success) {
      completedCount++;
    }
  }

  return completedCount;
}
