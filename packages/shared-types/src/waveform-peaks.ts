/** Worker-written JSON for WaveSurfer peak rendering (R2 contract). */
export type WaveformPeaksDocument = {
  version: 1;
  channels: 1;
  sample_rate: number;
  duration_seconds: number;
  peaks: number[];
};

export function waveformPeaksStoragePath(
  ownerId: string,
  audioFileId: string,
): string {
  return `${ownerId}/${audioFileId}.peaks.json`;
}
