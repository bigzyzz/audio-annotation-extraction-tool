import { spawn } from "node:child_process";
import type {
  ExtractedAnnotation,
  ExtractedAnnotationMetadata,
} from "@audio-tool/shared-types";
import { getFfmpegBinaryPath } from "./lib/ffmpeg.js";

export type AudioFormat = "mp3" | "wav";

export interface AnnotationItem {
  id: string;
  start_seconds: number | string;
  end_seconds: number | string | null;
  label?: string | null;
  comment?: string | null;
}

export interface ValidateRangeResult {
  valid: boolean;
  error?: string;
  durationSeconds?: number;
}

export interface FfmpegCutOptions {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  format: AudioFormat;
}

export interface ExtractSegmentOptions {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  endSeconds: number;
  format: AudioFormat;
  totalDurationSeconds?: number | null;
}

export interface ExtractSegmentResult {
  outputPath: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  format: AudioFormat;
}

export interface MetadataDocumentOptions {
  sourceAudioFileId: string;
  sourceFilename?: string;
  startSeconds: number;
  endSeconds: number;
  format: AudioFormat;
}

/**
 * Validates extraction boundary timestamps.
 * Ensures:
 * - Both timestamps are finite numbers
 * - startSeconds >= 0
 * - endSeconds > startSeconds
 * - duration is at least 0.05 seconds
 * - timestamps do not exceed totalDurationSeconds (if provided)
 */
export function validateExtractRange(
  startSeconds: number,
  endSeconds: number,
  totalDurationSeconds?: number | null,
): ValidateRangeResult {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return { valid: false, error: "Start and end times must be valid numbers" };
  }

  if (startSeconds < 0) {
    return { valid: false, error: "Start time must be non-negative" };
  }

  if (endSeconds <= startSeconds) {
    return { valid: false, error: "End time must be after start time" };
  }

  const duration = Number((endSeconds - startSeconds).toFixed(3));
  if (duration < 0.05) {
    return { valid: false, error: "Segment duration must be at least 0.05 seconds" };
  }

  if (
    totalDurationSeconds != null &&
    Number.isFinite(totalDurationSeconds) &&
    totalDurationSeconds > 0
  ) {
    if (startSeconds >= totalDurationSeconds) {
      return { valid: false, error: "Start time exceeds track duration" };
    }
  }

  return { valid: true, durationSeconds: duration };
}

/**
 * Builds deterministic FFmpeg command arguments for lossless audio stream copying.
 * Uses `-c copy` to avoid lossy re-encoding (req R8) and `-avoid_negative_ts make_zero`
 * so extracted audio starts cleanly at timestamp 00:00.
 */
export function buildFfmpegCutArgs(options: FfmpegCutOptions): string[] {
  const { inputPath, outputPath, startSeconds, durationSeconds } = options;

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    startSeconds.toFixed(3),
    "-i",
    inputPath,
    "-t",
    durationSeconds.toFixed(3),
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    "-y",
    outputPath,
  ];
}

/**
 * Spawns an FFmpeg child process to execute the stream copy.
 */
export function executeFfmpegCut(args: string[], binaryPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = binaryPath || getFfmpegBinaryPath();
    const proc = spawn(ffmpegBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: unknown) => {
      const message =
        err && typeof err === "object" && "code" in err && err.code === "ENOENT"
          ? "ffmpeg not found on PATH. Install ffmpeg to enable lossless extraction."
          : (err as Error).message;
      reject(new Error(message, { cause: err }));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg cut exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Performs end-to-end lossless extraction on an audio file.
 */
export async function extractLosslessSegment(
  options: ExtractSegmentOptions,
): Promise<ExtractSegmentResult> {
  const check = validateExtractRange(
    options.startSeconds,
    options.endSeconds,
    options.totalDurationSeconds,
  );

  if (!check.valid || check.durationSeconds == null) {
    throw new Error(check.error ?? "Invalid extraction range");
  }

  const cutArgs = buildFfmpegCutArgs({
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    startSeconds: options.startSeconds,
    durationSeconds: check.durationSeconds,
    format: options.format,
  });

  await executeFfmpegCut(cutArgs);

  return {
    outputPath: options.outputPath,
    startSeconds: options.startSeconds,
    endSeconds: options.endSeconds,
    durationSeconds: check.durationSeconds,
    format: options.format,
  };
}

/**
 * Checks whether an annotation overlaps the given extraction segment.
 * - Point note: occurs within [startSeconds, endSeconds]
 * - Range note: note range intersects [startSeconds, endSeconds]
 */
export function isAnnotationInSegment(
  annotation: AnnotationItem,
  segmentStart: number,
  segmentEnd: number,
): boolean {
  const noteStart = Number(annotation.start_seconds);
  const noteEnd =
    annotation.end_seconds != null ? Number(annotation.end_seconds) : null;

  if (noteEnd == null || noteEnd <= noteStart) {
    // Point annotation
    return noteStart >= segmentStart && noteStart <= segmentEnd;
  }

  // Range annotation: overlap test
  return noteStart < segmentEnd && noteEnd > segmentStart;
}

/**
 * Maps annotations into segment-relative timestamps (starting at 0:00) while
 * preserving original song timestamps.
 */
export function buildAnnotationMetadataDocument(
  annotations: AnnotationItem[],
  options: MetadataDocumentOptions,
): ExtractedAnnotationMetadata {
  const { sourceAudioFileId, sourceFilename, startSeconds, endSeconds, format } =
    options;
  const duration = Number((endSeconds - startSeconds).toFixed(3));

  const overlapping = annotations.filter((note) =>
    isAnnotationInSegment(note, startSeconds, endSeconds),
  );

  const mapped: ExtractedAnnotation[] = overlapping.map((note) => {
    const origStart = Number(note.start_seconds);
    const origEnd =
      note.end_seconds != null ? Number(note.end_seconds) : null;

    const segStart = Math.max(
      0,
      Number((origStart - startSeconds).toFixed(2)),
    );

    const segEnd =
      origEnd != null
        ? Number(
            Math.min(
              duration,
              Math.max(0, origEnd - startSeconds),
            ).toFixed(2),
          )
        : null;

    return {
      id: note.id,
      original_start_seconds: origStart,
      original_end_seconds: origEnd,
      segment_start_seconds: segStart,
      segment_end_seconds: segEnd,
      label: note.label ?? null,
      comment: note.comment ?? null,
    };
  });

  return {
    version: 1,
    source_audio_file_id: sourceAudioFileId,
    source_filename: sourceFilename,
    segment: {
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      duration_seconds: duration,
      format,
    },
    extracted_at: new Date().toISOString(),
    annotations_count: mapped.length,
    annotations: mapped,
  };
}
