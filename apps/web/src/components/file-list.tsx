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
>;

type FileListProps = {
  files: FileListItem[];
  error?: string | null;
};

function durationLabel(seconds: number | null): string {
  if (seconds == null) return "Processing…";
  return formatDurationSeconds(seconds);
}

export function FileList({ files, error }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {error}
          </p>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No tracks yet. Upload an MP3 or WAV to get started.
        </p>
      </div>
    );
  }

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
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
