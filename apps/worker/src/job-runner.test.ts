process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractionMetadataStoragePath,
  extractionStoragePath,
} from "@audio-tool/shared-types";
import {
  claimExtractionJob,
  fetchPendingExtractionJobs,
  markJobCompleted,
  markJobFailed,
  processExtractionJob,
  processPendingExtractionJobs,
} from "./job-runner.js";

describe("extraction storage path contracts", () => {
  it("generates correct audio extraction path in storage", () => {
    const fileId = "550e8400-e29b-41d4-a716-446655440000";
    const jobId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

    assert.equal(
      extractionStoragePath(fileId, jobId, "mp3"),
      `extractions/${fileId}/${jobId}.mp3`,
    );

    assert.equal(
      extractionStoragePath(fileId, jobId, "wav"),
      `extractions/${fileId}/${jobId}.wav`,
    );
  });

  it("generates correct annotation metadata sidecar path in storage", () => {
    const fileId = "550e8400-e29b-41d4-a716-446655440000";
    const jobId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

    assert.equal(
      extractionMetadataStoragePath(fileId, jobId),
      `extractions/${fileId}/${jobId}.annotations.json`,
    );
  });
});

describe("job runner contracts and functions", () => {
  it("exports job runner lifecycle functions", () => {
    assert.equal(typeof claimExtractionJob, "function");
    assert.equal(typeof fetchPendingExtractionJobs, "function");
    assert.equal(typeof markJobFailed, "function");
    assert.equal(typeof markJobCompleted, "function");
    assert.equal(typeof processExtractionJob, "function");
    assert.equal(typeof processPendingExtractionJobs, "function");
  });
});
