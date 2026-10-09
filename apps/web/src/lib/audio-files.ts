import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";

export const AUDIO_BUCKET = "audio";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DeleteAudioFileResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * T22 (R6): Deletes an audio file and associated storage objects.
 * Verifies that the authenticated user owns the track.
 */
export async function deleteAudioFile(
  supabase: SupabaseClient<Database>,
  audioFileId: string,
): Promise<DeleteAudioFileResult> {
  const id = audioFileId.trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, error: "Invalid audio file identifier." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be logged in to delete an audio track." };
  }

  // 1. Fetch file to verify ownership and collect storage paths
  const { data: file, error: fetchError } = await supabase
    .from("audio_files")
    .select("id, owner_id, storage_path, waveform_peaks_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !file) {
    return { ok: false, error: "Audio track not found or already deleted." };
  }

  if (file.owner_id !== user.id) {
    return { ok: false, error: "You do not have permission to delete this track." };
  }

  // 2. Delete row from audio_files (Postgres cascades delete to annotations and extraction_jobs)
  const { error: deleteError } = await supabase
    .from("audio_files")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (deleteError) {
    return { ok: false, error: "Couldn't delete audio track. Please try again." };
  }

  // 3. Best-effort storage cleanup
  const pathsToRemove: string[] = [];
  if (file.storage_path) pathsToRemove.push(file.storage_path);
  if (file.waveform_peaks_path) pathsToRemove.push(file.waveform_peaks_path);

  if (pathsToRemove.length > 0) {
    await supabase.storage
      .from(AUDIO_BUCKET)
      .remove(pathsToRemove)
      .catch(() => null);
  }

  return { ok: true };
}
