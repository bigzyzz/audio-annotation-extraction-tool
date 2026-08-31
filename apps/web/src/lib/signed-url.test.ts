import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";
import {
  AUDIO_BUCKET,
  SIGNED_PLAYBACK_URL_TTL_SECONDS,
  createSignedPlaybackUrl,
  validateAudioStoragePath,
} from "./signed-url";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockSupabase(options: {
  user?: { id: string } | null;
  signedUrl?: string | null;
  storageError?: string;
}): SupabaseClient<Database> {
  return {
    auth: {
      getUser: async () => ({
        data: { user: options.user ?? null },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          assert.equal(bucket, AUDIO_BUCKET);
          assert.equal(ttl, SIGNED_PLAYBACK_URL_TTL_SECONDS);
          if (options.storageError) {
            return { data: null, error: { message: options.storageError } };
          }
          if (!options.signedUrl) {
            return { data: { signedUrl: null }, error: null };
          }
          return {
            data: { signedUrl: options.signedUrl, path },
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe("validateAudioStoragePath", () => {
  it("accepts source mp3/wav and peaks json paths", () => {
    assert.deepEqual(
      validateAudioStoragePath(`${OWNER}/${FILE}.mp3`),
      { ok: true, path: `${OWNER}/${FILE}.mp3` },
    );
    assert.deepEqual(
      validateAudioStoragePath(`${OWNER}/${FILE}.wav`),
      { ok: true, path: `${OWNER}/${FILE}.wav` },
    );
    assert.deepEqual(
      validateAudioStoragePath(`${OWNER}/${FILE}.peaks.json`),
      { ok: true, path: `${OWNER}/${FILE}.peaks.json` },
    );
  });

  it("rejects empty, traversal, and malformed paths", () => {
    for (const path of [
      "",
      "   ",
      `/${OWNER}/${FILE}.mp3`,
      `${OWNER}/../${FILE}.mp3`,
      `${OWNER}/${FILE}.txt`,
      "not-a-uuid/file.mp3",
    ]) {
      const result = validateAudioStoragePath(path);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /missing|invalid/i);
    }
  });
});

describe("createSignedPlaybackUrl", () => {
  it("returns a signed URL for an authenticated user", async () => {
    const path = `${OWNER}/${FILE}.mp3`;
    const result = await createSignedPlaybackUrl(
      mockSupabase({
        user: { id: OWNER },
        signedUrl: "https://example.test/signed",
      }),
      path,
    );

    assert.deepEqual(result, { ok: true, url: "https://example.test/signed" });
  });

  it("fails when session is absent", async () => {
    const result = await createSignedPlaybackUrl(
      mockSupabase({ user: null }),
      `${OWNER}/${FILE}.wav`,
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /log in/i);
  });

  it("fails when storage cannot sign the path", async () => {
    const result = await createSignedPlaybackUrl(
      mockSupabase({
        user: { id: OWNER },
        storageError: "Object not found",
      }),
      `${OWNER}/${FILE}.peaks.json`,
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /playback link/i);
  });
});
