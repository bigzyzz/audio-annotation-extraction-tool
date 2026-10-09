"use server";

import { createClient } from "@/lib/supabase/server";
import { deleteAudioFile, type DeleteAudioFileResult } from "@/lib/audio-files";

export type { DeleteAudioFileResult };

/**
 * T22 (R6): Server action for deleting an audio file with ownership verification
 * and storage cleanup.
 */
export async function deleteAudioFileAction(
  audioFileId: string,
): Promise<DeleteAudioFileResult> {
  const supabase = await createClient();
  return deleteAudioFile(supabase, audioFileId);
}
