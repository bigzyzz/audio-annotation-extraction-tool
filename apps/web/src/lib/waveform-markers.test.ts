import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotationToRegionParams,
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
      start_seconds: 3.0,
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

  it("finds a single active range annotation", () => {
    const active = findActiveAnnotation(notes, 2.2, true);
    assert.equal(active?.id, "note-1");
  });

  it("finds a point annotation within its 2.5s display window", () => {
    // note-2 starts at 3.5, window lasts up to 6.0 (3.5 + 2.5)
    const active = findActiveAnnotation([notes[1]], 4.0, true);
    assert.equal(active?.id, "note-2");

    const pastWindow = findActiveAnnotation([notes[1]], 6.1, true);
    assert.equal(pastWindow, null);
  });

  it("picks the most recent annotation when multiple overlap at current time", () => {
    // At t = 3.6s, note-1 (created 10:00), note-2 (created 10:05), and note-3 (created 10:10) all overlap
    const active = findActiveAnnotation(notes, 3.6, true);
    assert.equal(active?.id, "note-3");
    assert.equal(active?.label, "Guitar Riff");
  });
});

