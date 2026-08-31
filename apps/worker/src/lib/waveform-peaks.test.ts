import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PEAKS_PER_SECOND,
  buildWaveformPeaks,
} from "./waveform-peaks.js";

describe("buildWaveformPeaks", () => {
  it("downsamples to roughly peaks-per-second buckets", () => {
    const durationSeconds = 2;
    const decodeRate = 8000;
    const samples = new Float32Array(decodeRate * durationSeconds);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 200 === 0 ? 0.9 : 0.01;
    }

    const doc = buildWaveformPeaks(samples, 44100, durationSeconds);

    assert.equal(doc.version, 1);
    assert.equal(doc.channels, 1);
    assert.equal(doc.sample_rate, 44100);
    assert.equal(doc.duration_seconds, 2);
    assert.equal(doc.peaks.length, durationSeconds * PEAKS_PER_SECOND);
    assert.ok(doc.peaks.some((peak) => peak >= 0.8));
    assert.ok(doc.peaks.every((peak) => peak >= 0 && peak <= 1));
  });

  it("keeps JSON compact (not one peak per PCM sample)", () => {
    const durationSeconds = 10;
    const samples = new Float32Array(8000 * durationSeconds).fill(0.25);
    const doc = buildWaveformPeaks(samples, 48000, durationSeconds);

    assert.ok(doc.peaks.length < samples.length / 10);
  });
});
