import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FilePlayerPanel } from "@/components/file-player-panel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function FilePage({ params }: FilePageProps) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: file } = await supabase
    .from("audio_files")
    .select(
      "id, filename, format, duration_seconds, storage_path, waveform_peaks_path",
    )
    .eq("id", id)
    .maybeSingle();

  if (!file) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <svg
            className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to library
        </Link>
      </div>
      <FilePlayerPanel initialFile={file} />
    </main>
  );
}
