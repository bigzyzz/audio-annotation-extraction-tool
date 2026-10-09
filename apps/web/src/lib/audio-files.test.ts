import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";
import { deleteAudioFile } from "./audio-files";

const VALID_FILE_ID = "11111111-1111-4111-8111-111111111111";
const INVALID_FILE_ID = "not-a-uuid";

describe("deleteAudioFile", () => {
  it("rejects invalid audio file UUID", async () => {
    const mockSupabase = {} as unknown as SupabaseClient<Database>;
    const res = await deleteAudioFile(mockSupabase, INVALID_FILE_ID);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /invalid audio file/i);
    }
  });

  it("fails when user is not authenticated", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as unknown as SupabaseClient<Database>;

    const res = await deleteAudioFile(mockSupabase, VALID_FILE_ID);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /logged in/i);
    }
  });

  it("fails when audio file is not found", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const res = await deleteAudioFile(mockSupabase, VALID_FILE_ID);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /not found or already deleted/i);
    }
  });

  it("fails when user is not the owner of the track", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: VALID_FILE_ID,
                owner_id: "other-user",
                storage_path: "other-user/file.mp3",
                waveform_peaks_path: "other-user/file.peaks.json",
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const res = await deleteAudioFile(mockSupabase, VALID_FILE_ID);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /permission/i);
    }
  });

  it("deletes audio file and removes storage files when owner", async () => {
    let deletedFromTable = "";
    let deletedId = "";
    let deletedOwner = "";
    let removedPaths: string[] = [];

    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "audio_files") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: VALID_FILE_ID,
                    owner_id: "user-123",
                    storage_path: "user-123/track.mp3",
                    waveform_peaks_path: "user-123/track.peaks.json",
                  },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: (_col1: string, val1: string) => ({
                eq: (_col2: string, val2: string) => {
                  deletedFromTable = table;
                  deletedId = val1;
                  deletedOwner = val2;
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from: (bucket: string) => {
          assert.equal(bucket, "audio");
          return {
            remove: async (paths: string[]) => {
              removedPaths = paths;
              return { data: [], error: null };
            },
          };
        },
      },
    } as unknown as SupabaseClient<Database>;

    const res = await deleteAudioFile(mockSupabase, VALID_FILE_ID);
    assert.equal(res.ok, true);
    assert.equal(deletedFromTable, "audio_files");
    assert.equal(deletedId, VALID_FILE_ID);
    assert.equal(deletedOwner, "user-123");
    assert.deepEqual(removedPaths, [
      "user-123/track.mp3",
      "user-123/track.peaks.json",
    ]);
  });
});
