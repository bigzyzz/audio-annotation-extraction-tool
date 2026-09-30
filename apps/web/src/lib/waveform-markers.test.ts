import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotationToRegionParams,
  clampAudioTime,
  clickRatioToAudioTime,
  findActiveAnnotation,
} from "./waveform-markers";

describe("annotationToRegionParams", () => {
  it("maps a point note and a range onto region times without canvas text clutter", () => {
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

describe("clampAudioTime", () => {
  it("clamps time within 0 and total duration", () => {
    assert.equal(clampAudioTime(5, 10), 5);
    assert.equal(clampAudioTime(-2, 10), 0);
    assert.equal(clampAudioTime(15, 10), 10);
    assert.equal(clampAudioTime(5, 0), 0);
    assert.equal(clampAudioTime(5, -10), 0);
  });
});

describe("findActiveAnnotation", () => {
  const notes = [
    {
      id: "note-1",
      start_seconds: 2.0,
      end_seconds: 5.0,
      label: "Intro Vocals",
      comment: "A bit loud here",
      created_at: "2026-09-30T10:00:00Z",
    },
    {
      id: "note-2",
      start_seconds: 3.5,
      end_seconds: null,
      label: "Snare Accent",
      comment: "Crisp hit",
      created_at: "2026-09-30T10:05:00Z",
    },
    {
      id: "note-3",
      start_seconds: 2.3,
      end_seconds: 6.0,
      label: "Guitar Riff",
      comment: "Overlap note",
      created_at: "2026-09-30T10:10:00Z",
    },
  ];

  it("returns null when not playing or time is missing", () => {
    assert.equal(findActiveAnnotation(notes, 2.5, false), null);
    assert.equal(findActiveAnnotation(notes, null, true), null);
    assert.equal(findActiveAnnotation(notes, 0.5, true), null);
  });

  it("finds an active annotation within its 1.0s display window and clears afterwards", () => {
    // note-1 starts at 2.0, active until 3.0
    const activeAtStart = findActiveAnnotation([notes[0]], 2.0, true);
    assert.equal(activeAtStart?.id, "note-1");

    const activeMid = findActiveAnnotation([notes[0]], 2.6, true);
    assert.equal(activeMid?.id, "note-1");

    const clearedAfter1Sec = findActiveAnnotation([notes[0]], 3.0, true);
    assert.equal(clearedAfter1Sec, null);

    const clearedPast = findActiveAnnotation([notes[0]], 3.2, true);
    assert.equal(clearedPast, null);
  });

  it("allows two annotations within 2-3 seconds to both appear in turn without masking", () => {
    // Note 1 starts at 2.0s (active 2.0s -> 3.0s)
    // Note 2 starts at 3.5s (active 3.5s -> 4.5s)
    const pair = [notes[0], notes[1]];

    // At 2.5s, Note 1 is visible
    assert.equal(findActiveAnnotation(pair, 2.5, true)?.id, "note-1");

    // At 3.2s, Note 1 has completed its 1.0s window, so banner is clear
    assert.equal(findActiveAnnotation(pair, 3.2, true), null);

    // At 3.7s, Note 2 is visible
    assert.equal(findActiveAnnotation(pair, 3.7, true)?.id, "note-2");

    // At 4.6s, Note 2 has completed its 1.0s window
    assert.equal(findActiveAnnotation(pair, 4.6, true), null);
  });

  it("picks the most recent annotation when multiple overlap within the same 1.0s window", () => {
    // At t = 2.4s, note-1 (starts 2.0, created 10:00) and note-3 (starts 2.3, created 10:10) both overlap
    const active = findActiveAnnotation([notes[0], notes[2]], 2.4, true);
    assert.equal(active?.id, "note-3");
    assert.equal(active?.label, "Guitar Riff");
  });
});

