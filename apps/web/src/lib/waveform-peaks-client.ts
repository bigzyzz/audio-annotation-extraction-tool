import type { WaveformPeaksDocument } from "@audio-tool/shared-types";

export type WaveSurferPeaksLoad = {
  channelData: number[][];
  duration: number;
};

export function peaksDocumentToWaveSurferLoad(
  document: WaveformPeaksDocument,
): WaveSurferPeaksLoad {
  if (document.version !== 1 || document.channels !== 1) {
    throw new Error("Unsupported waveform peaks document.");
  }
  if (!Number.isFinite(document.duration_seconds) || document.duration_seconds <= 0) {
    throw new Error("Waveform peaks document has an invalid duration.");
  }
  if (document.peaks.length === 0) {
    throw new Error("Waveform peaks document is empty.");
  }

  return {
    channelData: [document.peaks],
    duration: document.duration_seconds,
  };
}
