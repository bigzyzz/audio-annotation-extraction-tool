import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WaveformPeaksDocument } from "@audio-tool/shared-types";
import { peaksDocumentToWaveSurferLoad } from "./waveform-peaks-client";

const fixture: WaveformPeaksDocument = {
  version: 1,
  channels: 1,
  sample_rate: 44100,
  duration_seconds: 2,
  peaks: [0.1, 0.8, 0.3],
};

describe("peaksDocumentToWaveSurferLoad", () => {
  it("maps mono peaks into WaveSurfer channel data", () => {
    const result = peaksDocumentToWaveSurferLoad(fixture);
    assert.deepEqual(result.channelData, [fixture.peaks]);
    assert.equal(result.duration, 2);
  });

  it("rejects unsupported or empty documents", () => {
    assert.throws(() =>
      peaksDocumentToWaveSurferLoad({
        ...fixture,
        version: 2 as 1,
      }),
    );
    assert.throws(() =>
      peaksDocumentToWaveSurferLoad({
        ...fixture,
        peaks: [],
      }),
    );
  });
});
