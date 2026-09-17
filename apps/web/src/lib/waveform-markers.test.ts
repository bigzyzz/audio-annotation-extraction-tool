import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotationToRegionParams,
  clickRatioToAudioTime,
} from "./waveform-markers";

describe("annotationToRegionParams", () => {
  it("maps a point note and a range onto region times", () => {
    assert.deepEqual(
      annotationToRegionParams({
        id: "a",
        start_seconds: 1.234,
        end_seconds: null,
        label: "kick",
      }),
      {
        id: "a",
        start: 1.23,
        end: 1.23,
        drag: false,
        resize: false,
        color: "rgba(24, 24, 27, 0.85)",
        content: "kick",
      },
    );

    assert.equal(
      annotationToRegionParams({
        id: "b",
        start_seconds: 1,
        end_seconds: 2.5,
        label: "  ",
      }).end,
      2.5,
    );
  });
});

describe("clickRatioToAudioTime", () => {
  it("converts a waveform click into audio-clock seconds", () => {
    assert.equal(clickRatioToAudioTime(0.5, 10), 5);
    assert.equal(clickRatioToAudioTime(-0.1, 10), 0);
    assert.equal(clickRatioToAudioTime(1.2, 10), 10);
  });
});
