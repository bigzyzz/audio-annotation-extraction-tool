import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAnnotationMetadataDocument,
  buildFfmpegCutArgs,
  isAnnotationInSegment,
  validateExtractRange,
  type AnnotationItem,
} from "./extract.js";

describe("validateExtractRange", () => {
  it("accepts valid extraction range and calculates duration", () => {
    const res = validateExtractRange(10.25, 25.75);
    assert.equal(res.valid, true);
    assert.equal(res.durationSeconds, 15.5);
  });

  it("rejects non-finite inputs", () => {
    assert.equal(validateExtractRange(NaN, 10).valid, false);
    assert.equal(validateExtractRange(10, Infinity).valid, false);
  });

  it("rejects negative start time", () => {
    const res = validateExtractRange(-1, 10);
    assert.equal(res.valid, false);
    assert.match(res.error ?? "", /non-negative/i);
  });

  it("rejects end time earlier than or equal to start time", () => {
    const res1 = validateExtractRange(15, 10);
    assert.equal(res1.valid, false);
    assert.match(res1.error ?? "", /after start time/i);

    const res2 = validateExtractRange(10, 10);
    assert.equal(res2.valid, false);
    assert.match(res2.error ?? "", /after start time/i);
  });

  it("rejects sub-50ms cut durations", () => {
    const res = validateExtractRange(10.0, 10.02);
    assert.equal(res.valid, false);
    assert.match(res.error ?? "", /at least 0\.05 seconds/i);
  });

  it("rejects start time beyond total duration", () => {
    const res = validateExtractRange(120, 130, 100);
    assert.equal(res.valid, false);
    assert.match(res.error ?? "", /exceeds track duration/i);
  });

  it("accepts valid range within total duration", () => {
    const res = validateExtractRange(10, 50, 100);
    assert.equal(res.valid, true);
    assert.equal(res.durationSeconds, 40);
  });
});

describe("buildFfmpegCutArgs", () => {
  it("builds lossless stream-copy command for MP3 without re-encoding", () => {
    const args = buildFfmpegCutArgs({
      inputPath: "/tmp/source.mp3",
      outputPath: "/tmp/out.mp3",
      startSeconds: 12.345,
      durationSeconds: 5.5,
      format: "mp3",
    });

    assert.ok(args.includes("-i"));
    assert.ok(args.includes("/tmp/source.mp3"));
    assert.ok(args.includes("-ss"));
    assert.ok(args.includes("12.345"));
    assert.ok(args.includes("-t"));
    assert.ok(args.includes("5.500"));
    assert.ok(args.includes("-c"));
    assert.ok(args.includes("copy")); // Lossless stream copy flag for R8
    assert.ok(args.includes("-avoid_negative_ts"));
    assert.ok(args.includes("make_zero"));
    assert.equal(args[args.length - 1], "/tmp/out.mp3");
  });

  it("builds lossless stream-copy command for WAV", () => {
    const args = buildFfmpegCutArgs({
      inputPath: "/tmp/source.wav",
      outputPath: "/tmp/out.wav",
      startSeconds: 0.0,
      durationSeconds: 10.0,
      format: "wav",
    });

    assert.ok(args.includes("-c"));
    assert.ok(args.includes("copy"));
    assert.ok(args.includes("/tmp/out.wav"));
  });
});

describe("isAnnotationInSegment", () => {
  it("matches point annotations within the segment", () => {
    const note: AnnotationItem = {
      id: "1",
      start_seconds: 15.0,
      end_seconds: null,
    };
    assert.equal(isAnnotationInSegment(note, 10.0, 20.0), true);
    assert.equal(isAnnotationInSegment(note, 10.0, 12.0), false);
    assert.equal(isAnnotationInSegment(note, 16.0, 20.0), false);
    assert.equal(isAnnotationInSegment(note, 15.0, 20.0), true); // exact start boundary
    assert.equal(isAnnotationInSegment(note, 10.0, 15.0), true); // exact end boundary
  });

  it("matches range annotations overlapping the segment", () => {
    const note: AnnotationItem = {
      id: "2",
      start_seconds: 12.0,
      end_seconds: 18.0,
    };
    assert.equal(isAnnotationInSegment(note, 10.0, 20.0), true); // contained
    assert.equal(isAnnotationInSegment(note, 15.0, 25.0), true); // overlaps start
    assert.equal(isAnnotationInSegment(note, 5.0, 15.0), true); // overlaps end
    assert.equal(isAnnotationInSegment(note, 0.0, 10.0), false); // before
    assert.equal(isAnnotationInSegment(note, 20.0, 30.0), false); // after
  });
});

describe("buildAnnotationMetadataDocument", () => {
  it("maps overlapping annotations to segment-relative timestamps and retains metadata", () => {
    const notes: AnnotationItem[] = [
      {
        id: "a1",
        start_seconds: 5.0,
        end_seconds: null,
        label: "Before segment",
      },
      {
        id: "a2",
        start_seconds: 12.5,
        end_seconds: null,
        label: "Point inside",
        comment: "Guitar solo begins",
      },
      {
        id: "a3",
        start_seconds: 8.0,
        end_seconds: 14.0,
        label: "Overlapping start",
      },
      {
        id: "a4",
        start_seconds: 25.0,
        end_seconds: null,
        label: "After segment",
      },
    ];

    const doc = buildAnnotationMetadataDocument(notes, {
      sourceAudioFileId: "file-123",
      sourceFilename: "song.mp3",
      startSeconds: 10.0,
      endSeconds: 20.0,
      format: "mp3",
    });

    assert.equal(doc.version, 1);
    assert.equal(doc.source_audio_file_id, "file-123");
    assert.equal(doc.source_filename, "song.mp3");
    assert.equal(doc.segment.duration_seconds, 10.0);
    assert.equal(doc.segment.format, "mp3");
    assert.equal(doc.annotations_count, 2);

    // a2 (12.5s) -> segment relative 2.5s
    const noteA2 = doc.annotations.find((a) => a.id === "a2");
    assert.ok(noteA2);
    assert.equal(noteA2.original_start_seconds, 12.5);
    assert.equal(noteA2.segment_start_seconds, 2.5);
    assert.equal(noteA2.segment_end_seconds, null);
    assert.equal(noteA2.comment, "Guitar solo begins");

    // a3 (8.0s - 14.0s) -> segment relative 0s to 4.0s
    const noteA3 = doc.annotations.find((a) => a.id === "a3");
    assert.ok(noteA3);
    assert.equal(noteA3.original_start_seconds, 8.0);
    assert.equal(noteA3.segment_start_seconds, 0); // clamped to start of segment
    assert.equal(noteA3.segment_end_seconds, 4.0);
  });
});
