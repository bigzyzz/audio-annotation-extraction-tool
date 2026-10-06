import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExtractionJob } from "@audio-tool/shared-types";
import {
  createExtractionDownloadUrls,
  EXTRACTION_ERRORS,
  getExtractionJobs,
  requestExtractionJob,
  roundExtractionTime,
  validateExtractionStoragePath,
  validateExtractionTimes,
} from "./extraction.js";

const VALID_FILE_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_JOB_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("validateExtractionTimes", () => {
  it("accepts valid start and end times and computes duration", () => {
    const res = validateExtractionTimes(12.345, 25.5);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.duration, 13.155);
    }
  });

  it("rejects non-finite inputs", () => {
    assert.equal(validateExtractionTimes(NaN, 10).ok, false);
    assert.equal(validateExtractionTimes(10, Infinity).ok, false);
  });

  it("rejects negative start time", () => {
    const res = validateExtractionTimes(-0.5, 10);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, EXTRACTION_ERRORS.negativeStart);
    }
  });

  it("rejects end time before or equal to start time", () => {
    const res1 = validateExtractionTimes(10, 5);
    assert.equal(res1.ok, false);
    if (!res1.ok) {
      assert.equal(res1.error, EXTRACTION_ERRORS.endBeforeStart);
    }

    const res2 = validateExtractionTimes(10, 10);
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.equal(res2.error, EXTRACTION_ERRORS.endBeforeStart);
    }
  });

  it("rejects durations under 0.05 seconds", () => {
    const res = validateExtractionTimes(10.0, 10.02);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, EXTRACTION_ERRORS.tooShort);
    }
  });

  it("rejects start times beyond track duration", () => {
    const res = validateExtractionTimes(120, 130, 100);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, EXTRACTION_ERRORS.exceedsDuration);
    }
  });
});

describe("validateExtractionStoragePath", () => {
  it("validates audio extraction path and derives metadata sidecar path", () => {
    const audioPath = `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.mp3`;
    const res = validateExtractionStoragePath(audioPath);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.audioPath, audioPath);
      assert.equal(
        res.metadataPath,
        `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.annotations.json`,
      );
    }
  });

  it("accepts wav paths and correctly derives metadata path", () => {
    const wavPath = `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.wav`;
    const res = validateExtractionStoragePath(wavPath);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.audioPath, wavPath);
      assert.equal(
        res.metadataPath,
        `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.annotations.json`,
      );
    }
  });

  it("rejects invalid or traversal storage paths", () => {
    assert.equal(validateExtractionStoragePath("").ok, false);
    assert.equal(
      validateExtractionStoragePath("../extractions/file/job.mp3").ok,
      false,
    );
    assert.equal(
      validateExtractionStoragePath(`extractions/${VALID_FILE_ID}/job.flac`).ok,
      false,
    );
  });
});

describe("roundExtractionTime", () => {
  it("rounds times to two decimal places", () => {
    assert.equal(roundExtractionTime(12.3456), 12.35);
    assert.equal(roundExtractionTime(10), 10);
  });
});

describe("requestExtractionJob", () => {
  it("rejects invalid audioFileId UUID", async () => {
    const client = {} as unknown as SupabaseClient<Database>;
    const res = await requestExtractionJob(client, {
      audioFileId: "not-a-uuid",
      startSeconds: 0,
      endSeconds: 10,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, EXTRACTION_ERRORS.invalidFileId);
    }
  });

  it("fails when user is not authenticated", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as unknown as SupabaseClient<Database>;

    const res = await requestExtractionJob(mockSupabase, {
      audioFileId: VALID_FILE_ID,
      startSeconds: 0,
      endSeconds: 10,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, EXTRACTION_ERRORS.login);
    }
  });

  it("creates a pending extraction job when input is valid", async () => {
    const mockUser = { id: "user-123" };
    const mockCreatedJob: ExtractionJob = {
      id: VALID_JOB_ID,
      audio_file_id: VALID_FILE_ID,
      requested_by: "user-123",
      start_seconds: 5.5,
      end_seconds: 15.5,
      status: "pending",
      output_path: null,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let insertedPayload: Record<string, unknown> | null = null;

    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: mockUser }, error: null }),
      },
      from: (table: string) => {
        assert.equal(table, "extraction_jobs");
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: async () => ({ data: mockCreatedJob, error: null }),
              }),
            };
          },
        };
      },
    } as unknown as SupabaseClient<Database>;

    const res = await requestExtractionJob(mockSupabase, {
      audioFileId: VALID_FILE_ID,
      startSeconds: 5.501,
      endSeconds: 15.499,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.job.id, VALID_JOB_ID);
      assert.equal(res.job.status, "pending");
      assert.deepEqual(insertedPayload, {
        audio_file_id: VALID_FILE_ID,
        requested_by: "user-123",
        start_seconds: 5.5,
        end_seconds: 15.5,
        status: "pending",
      });
    }
  });
});

describe("getExtractionJobs", () => {
  it("rejects unauthenticated user", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as unknown as SupabaseClient<Database>;

    const res = await getExtractionJobs(mockSupabase, VALID_FILE_ID);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, EXTRACTION_ERRORS.login);
    }
  });

  it("fetches list of jobs for the audio file", async () => {
    const mockJobs: ExtractionJob[] = [
      {
        id: VALID_JOB_ID,
        audio_file_id: VALID_FILE_ID,
        requested_by: "user-123",
        start_seconds: 0,
        end_seconds: 10,
        status: "completed",
        output_path: `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.mp3`,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "user-123" } }, error: null }),
      },
      from: (table: string) => {
        assert.equal(table, "extraction_jobs");
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              assert.equal(val, VALID_FILE_ID);
              return {
                order: (_col: string, opts: { ascending: boolean }) => {
                  assert.equal(opts.ascending, false);
                  return Promise.resolve({ data: mockJobs, error: null });
                },
              };
            },
          }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    const res = await getExtractionJobs(mockSupabase, VALID_FILE_ID);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.jobs.length, 1);
      assert.equal(res.jobs[0].id, VALID_JOB_ID);
    }
  });
});

describe("createExtractionDownloadUrls", () => {
  it("generates signed download URLs for audio and metadata sidecar", async () => {
    const audioPath = `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.mp3`;
    const metadataPath = `extractions/${VALID_FILE_ID}/${VALID_JOB_ID}.annotations.json`;

    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "user-123" } }, error: null }),
      },
      storage: {
        from: (bucket: string) => {
          assert.equal(bucket, "audio");
          return {
            createSignedUrl: async (path: string) => {
              if (path === audioPath) {
                return {
                  data: { signedUrl: `https://storage.example.com/${audioPath}?token=abc` },
                  error: null,
                };
              }
              if (path === metadataPath) {
                return {
                  data: { signedUrl: `https://storage.example.com/${metadataPath}?token=def` },
                  error: null,
                };
              }
              return { data: null, error: new Error("File not found") };
            },
          };
        },
      },
    } as unknown as SupabaseClient<Database>;

    const res = await createExtractionDownloadUrls(mockSupabase, audioPath);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(
        res.urls.audioUrl,
        `https://storage.example.com/${audioPath}?token=abc`,
      );
      assert.equal(
        res.urls.metadataUrl,
        `https://storage.example.com/${metadataPath}?token=def`,
      );
    }
  });
});
