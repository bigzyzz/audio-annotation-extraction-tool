import { spawn } from "node:child_process";
import type { WaveformPeaksDocument } from "@audio-tool/shared-types";

export const PEAKS_PER_SECOND = 75;
export const DECODE_SAMPLE_RATE = 8000;

export function buildWaveformPeaks(
  samples: Float32Array,
  originalSampleRate: number,
  durationSeconds: number,
  peaksPerSecond = PEAKS_PER_SECOND,
): WaveformPeaksDocument {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("durationSeconds must be a positive number");
  }
  if (!Number.isFinite(originalSampleRate) || originalSampleRate <= 0) {
    throw new Error("originalSampleRate must be a positive number");
  }

  const totalPeaks = Math.max(1, Math.round(durationSeconds * peaksPerSecond));
  const samplesPerPeak = Math.max(1, Math.ceil(samples.length / totalPeaks));
  const peaks: number[] = [];

  for (let i = 0; i < totalPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, samples.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j] ?? 0);
      if (abs > max) max = abs;
    }
    peaks.push(Number(Math.min(1, max).toFixed(4)));
  }

  return {
    version: 1,
    channels: 1,
    sample_rate: Math.round(originalSampleRate),
    duration_seconds: Number(durationSeconds.toFixed(3)),
    peaks,
  };
}

function decodeMonoF32(
  filePath: string,
  sampleRate = DECODE_SAMPLE_RATE,
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        filePath,
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    proc.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      const message =
        "code" in err && err.code === "ENOENT"
          ? "ffmpeg not found on PATH"
          : err.message;
      reject(new Error(message, { cause: err }));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        return;
      }

      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        reject(new Error("ffmpeg produced no PCM output"));
        return;
      }

      const alignedLength = buffer.length - (buffer.length % 4);
      resolve(
        new Float32Array(
          buffer.buffer,
          buffer.byteOffset,
          alignedLength / 4,
        ),
      );
    });
  });
}

export async function generateWaveformPeaksFromFile(
  filePath: string,
  meta: { sampleRate: number; durationSeconds: number },
): Promise<WaveformPeaksDocument> {
  const samples = await decodeMonoF32(filePath);
  return buildWaveformPeaks(
    samples,
    meta.sampleRate,
    meta.durationSeconds,
  );
}
