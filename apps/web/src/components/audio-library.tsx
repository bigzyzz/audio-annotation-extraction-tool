"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UploadForm } from "@/components/upload-form";
import { FileList, type FileListItem } from "@/components/file-list";

const POLL_MS = 2000;

type AudioLibraryProps = {
  initialFiles: FileListItem[];
};

export function AudioLibrary({ initialFiles }: AudioLibraryProps) {
  const [files, setFiles] = useState<FileListItem[]>(initialFiles);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("audio_files")
      .select("id, filename, format, duration_seconds, created_at")
      .order("created_at", { ascending: false });

    if (queryError) {
      setError("Couldn't refresh the file list. Retrying…");
      return;
    }

    setError(null);
    setFiles(data ?? []);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="flex w-full flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            Upload a track
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            MP3 or WAV only. Duration fills in after the worker probes the file.
          </p>
        </div>
        <UploadForm onUploaded={() => void load()} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Library
        </h2>
        <FileList files={files} error={error} />
      </section>
    </div>
  );
}
