import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatExtractionStamp,
  formatJobStatus,
  getExtractionDownloadFilenames,
} from "./extraction-panel";

describe("formatExtractionStamp", () => {
  it("formats start and end seconds with duration", () => {
    assert.equal(formatExtractionStamp(5.2, 10.5), "5.20s – 10.50s (5.30s)");
    assert.equal(formatExtractionStamp(0, 3.125), "0.00s – 3.13s (3.13s)");
  });

  it("handles identical or close bounds safely", () => {
    assert.equal(formatExtractionStamp(10, 10), "10.00s – 10.00s (0.00s)");
  });
});

describe("formatJobStatus", () => {
  it("maps pending status to Queued with amber tone", () => {
    const res = formatJobStatus("pending");
    assert.equal(res.label, "Queued");
    assert.equal(res.tone, "amber");
  });

  it("maps processing status to Extracting with blue tone", () => {
    const res = formatJobStatus("processing");
    assert.equal(res.label, "Extracting");
    assert.equal(res.tone, "blue");
  });

  it("maps completed status to Ready with emerald tone", () => {
    const res = formatJobStatus("completed");
    assert.equal(res.label, "Ready");
    assert.equal(res.tone, "emerald");
  });

  it("maps failed status to Failed with rose tone", () => {
    const res = formatJobStatus("failed");
    assert.equal(res.label, "Failed");
    assert.equal(res.tone, "rose");
  });

  it("handles arbitrary or unrecognized status", () => {
    const res = formatJobStatus("unknown_status");
    assert.equal(res.label, "unknown_status");
    assert.equal(res.tone, "amber");
  });
});

describe("getExtractionDownloadFilenames", () => {
  it("builds safe download filenames from base filename and bounds", () => {
    const res = getExtractionDownloadFilenames("track_master.mp3", 1.5, 4.25, "mp3");
    assert.equal(res.audioFilename, "track_master-cut-1.50s-4.25s.mp3");
    assert.equal(res.metadataFilename, "track_master-cut-1.50s-4.25s.annotations.json");
  });

  it("sanitizes unsafe characters in filename", () => {
    const res = getExtractionDownloadFilenames("My Track #1 (Final)!.wav", 10, 20, "wav");
    assert.equal(res.audioFilename, "My_Track__1__Final__-cut-10.00s-20.00s.wav");
    assert.equal(res.metadataFilename, "My_Track__1__Final__-cut-10.00s-20.00s.annotations.json");
  });

  it("defaults to safe 'audio' fallback if filename is undefined", () => {
    const res = getExtractionDownloadFilenames(undefined, 0, 5, "mp3");
    assert.equal(res.audioFilename, "audio-cut-0.00s-5.00s.mp3");
    assert.equal(res.metadataFilename, "audio-cut-0.00s-5.00s.annotations.json");
  });
});
