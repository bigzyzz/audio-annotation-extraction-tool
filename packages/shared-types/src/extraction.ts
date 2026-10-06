/** Extracted annotation with both original and segment-relative offsets */
export interface ExtractedAnnotation {
  id: string;
  original_start_seconds: number;
  original_end_seconds: number | null;
  segment_start_seconds: number;
  segment_end_seconds: number | null;
  label: string | null;
  comment: string | null;
}

/** Sidecar metadata JSON bundled with extracted audio cut (R4 contract). */
export interface ExtractedAnnotationMetadata {
  version: 1;
  source_audio_file_id: string;
  source_filename?: string;
  segment: {
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
    format: "mp3" | "wav";
  };
  extracted_at: string;
  annotations_count: number;
  annotations: ExtractedAnnotation[];
}

export function extractionStoragePath(
  audioFileId: string,
  jobId: string,
  format: "mp3" | "wav",
): string {
  return `extractions/${audioFileId}/${jobId}.${format}`;
}

export function extractionMetadataStoragePath(
  audioFileId: string,
  jobId: string,
): string {
  return `extractions/${audioFileId}/${jobId}.annotations.json`;
}
