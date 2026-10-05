"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileList, type FileListItem } from "@/components/file-list";
import { SearchField } from "@/components/search-field";
import { searchAudioFiles } from "@/lib/search-audio";

const POLL_MS = 2000;

type AudioLibraryProps = {
  initialFiles: FileListItem[];
  initialQuery?: string;
};

export function AudioLibrary({
  initialFiles,
  initialQuery = "",
}: AudioLibraryProps) {
  const [files, setFiles] = useState<FileListItem[]>(initialFiles);
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref keeps track of the latest search query for background polling
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const load = useCallback(async (searchFilter: string) => {
    const supabase = createClient();
    const result = await searchAudioFiles(supabase, searchFilter);

    if (!result.ok) {
      setError("Couldn't refresh the file list. Retrying…");
      return;
    }

    setError(null);
    setFiles(result.files);
  }, []);

  // Poll using the current query filter
  useEffect(() => {
    const id = window.setInterval(() => {
      void load(queryRef.current);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const handleSearch = useCallback(
    async (nextQuery: string) => {
      setQuery(nextQuery);
      setIsSearching(true);

      // Synchronize ?q= in URL without full page reload
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const trimmed = nextQuery.trim();
        if (trimmed) {
          url.searchParams.set("q", trimmed);
        } else {
          url.searchParams.delete("q");
        }
        window.history.replaceState(null, "", url.toString());
      }

      const supabase = createClient();
      const result = await searchAudioFiles(supabase, nextQuery);

      setIsSearching(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setError(null);
      setFiles(result.files);
    },
    [],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            Library
          </h2>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div className="w-full sm:w-64">
              <SearchField
                onSearch={handleSearch}
                defaultValue={query}
                isPending={isSearching}
              />
            </div>
            <Link
              href="/upload"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Upload track
            </Link>
          </div>
        </div>
        <FileList files={files} error={error} searchQuery={query} />
      </section>
    </div>
  );
}
