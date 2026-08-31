import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";

export const AUDIO_BUCKET = "audio";
export const SIGNED_PLAYBACK_URL_TTL_SECONDS = 3600;

export type SignedPlaybackUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const AUDIO_STORAGE_PATH_RE = new RegExp(
  `^${UUID}\\/${UUID}\\.(mp3|wav|peaks\\.json)$`,
  "i",
);

export function validateAudioStoragePath(
  storagePath: string,
): SignedPlaybackUrlResult | { ok: true; path: string } {
  const path = storagePath.trim();
  if (!path) {
    return { ok: false, error: "Storage path is missing." };
  }
  if (path !== storagePath || path.includes("..") || path.startsWith("/")) {
    return { ok: false, error: "Storage path is invalid." };
  }
  if (!AUDIO_STORAGE_PATH_RE.test(path)) {
    return { ok: false, error: "Storage path is invalid." };
  }
  return { ok: true, path };
}

/** Signed URL for a private `audio` bucket object (source file or peaks JSON). */
export async function createSignedPlaybackUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
): Promise<SignedPlaybackUrlResult> {
  const validation = validateAudioStoragePath(storagePath);
  if (!validation.ok) return validation;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You need to log in to play audio." };
  }

  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(validation.path, SIGNED_PLAYBACK_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: "Couldn't get a playback link for that file. Try again.",
    };
  }

  return { ok: true, url: data.signedUrl };
}
