import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";
import type { FileListItem } from "@/components/file-list";
import { parseSearchQuery } from "./search-query";

/**
 * Standard columns selected for audio file list views and search results.
 */
export const AUDIO_SEARCH_COLUMNS =
  "id, filename, format, duration_seconds, created_at, waveform_peaks_path" as const;

export type SearchAudioFilesResult =
  | { ok: true; files: FileListItem[] }
  | { ok: false; error: string };

/**
 * Searches audio files by filename for authenticated users (R9).
 *
 * - Returns an error if the user is unauthenticated.
 * - If the query is empty or whitespace, returns all files ordered by created_at desc.
 * - If the query is non-empty, performs a case-insensitive ILIKE substring match with
 *   properly escaped wildcards.
 */
export async function searchAudioFiles(
  supabase: SupabaseClient<Database>,
  query: string | null | undefined,
): Promise<SearchAudioFilesResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You need to log in to search audio files." };
  }

  const parsed = parseSearchQuery(query);

  let queryBuilder = supabase
    .from("audio_files")
    .select(AUDIO_SEARCH_COLUMNS);

  if (!parsed.empty) {
    queryBuilder = queryBuilder.ilike("filename", parsed.pattern);
  }

  const { data, error } = await queryBuilder.order("created_at", {
    ascending: false,
  });

  if (error || !data) {
    return {
      ok: false,
      error: "Couldn't load search results. Please try again.",
    };
  }

  return { ok: true, files: data };
}
