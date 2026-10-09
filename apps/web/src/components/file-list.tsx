"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDurationSeconds } from "@/lib/format-duration";
import type { AudioFile } from "@audio-tool/shared-types";

export type FileListItem = Pick<
  AudioFile,
  | "id"
  | "filename"
  | "format"
  | "duration_seconds"
  | "created_at"
  | "waveform_peaks_path"
> & {
  owner_id?: string;
};

type FileListProps = {
  files: FileListItem[];
  error?: string | null;
  searchQuery?: string | null;
  currentUserId?: string | null;
  onDeleteFile?: (file: FileListItem) => Promise<void> | void;
  isDeletingId?: string | null;
};

export function emptyListMessage(searchQuery?: string | null): string {
  const trimmed = searchQuery?.trim();
  if (trimmed && trimmed.length > 0) {
    return `No tracks match "${trimmed}". Try another search or clear the search field.`;
  }
  return "No tracks yet. Upload an MP3 or WAV to get started.";
}

function durationLabel(seconds: number | null): string {
  if (seconds == null) return "Processing…";
  return formatDurationSeconds(seconds);
}

export function FileList({
  files,
  error,
  searchQuery,
  currentUserId,
  onDeleteFile,
  isDeletingId,
}: FileListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (files.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {error}
          </p>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {emptyListMessage(searchQuery)}
        </p>
      </div>
    );
  }

  const hasDeleteAction = Boolean(onDeleteFile);

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Uploaded audio files</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Format</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              {hasDeleteAction ? (
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const isOwner =
                !currentUserId || !file.owner_id || file.owner_id === currentUserId;
              const isPendingDelete = pendingDeleteId === file.id;
              const isDeleting = isDeletingId === file.id;

              return (
                <tr
                  key={file.id}
                  className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-black dark:text-zinc-50">
                    <Link
                      href={`/files/${file.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {file.filename}
                    </Link>
                  </td>
                  <td className="px-3 py-2 uppercase text-zinc-600 dark:text-zinc-400">
                    {file.format}
                  </td>
                  <td
                    className="px-3 py-2 text-zinc-700 dark:text-zinc-300"
                    aria-busy={file.duration_seconds == null}
                  >
                    {durationLabel(file.duration_seconds)}
                  </td>
                  {hasDeleteAction ? (
                    <td className="px-3 py-2 text-right">
                      {isOwner ? (
                        isPendingDelete ? (
                          <div
                            role="alertdialog"
                            aria-label={`Confirm deleting ${file.filename}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                              Delete track?
                            </span>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={async () => {
                                await onDeleteFile?.(file);
                                setPendingDeleteId(null);
                              }}
                              className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white shadow-xs hover:bg-red-700 disabled:opacity-50"
                            >
                              {isDeleting ? "Deleting…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setPendingDeleteId(null)}
                              className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(file.id)}
                            className="inline-flex items-center gap-1 rounded p-1 text-xs text-zinc-400 transition-colors hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            title={`Delete ${file.filename}`}
                            aria-label={`Delete ${file.filename}`}
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            <span>Delete</span>
                          </button>
                        )
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
