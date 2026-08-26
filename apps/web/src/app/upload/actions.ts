"use server";

import { createClient } from "@/lib/supabase/server";
import type { AudioFormat } from "@/lib/audio-validate";

const AUDIO_BUCKET = "audio";

export type RecordUploadedAudioInput = {
  id: string;
  filename: string;
  storagePath: string;
  format: AudioFormat;
};

export type RecordUploadedAudioResult =
  | { ok: true }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Insert `audio_files` only after Storage upload succeeded (R1 contract).
 * If the row insert fails, delete the Storage object so we don't leave an
 * orphan file with no row (and never an orphan row with no file).
 */
export async function recordUploadedAudio(
  input: RecordUploadedAudioInput,
): Promise<RecordUploadedAudioResult> {
  const id = input.id.trim();
  const filename = input.filename.trim();
  const storagePath = input.storagePath.trim();
  const format = input.format;

  if (!UUID_RE.test(id) || !filename || (format !== "mp3" && format !== "wav")) {
    return { ok: false, error: "Upload metadata is invalid. Try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You need to log in before uploading." };
  }

  const expectedPath = `${user.id}/${id}.${format}`;
  if (storagePath !== expectedPath) {
    return { ok: false, error: "Upload path doesn't match your account." };
  }

  const { error: insertError } = await supabase.from("audio_files").insert({
    id,
    owner_id: user.id,
    filename: filename.slice(0, 255),
    storage_path: storagePath,
    format,
  });

  if (!insertError) {
    return { ok: true };
  }

  await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);

  return {
    ok: false,
    error: "Couldn't save the file record. The upload was rolled back — try again.",
  };
}
