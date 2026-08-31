import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AudioLibrary } from "@/components/audio-library";
import type { FileListItem } from "@/components/file-list";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    typeof user?.user_metadata?.username === "string"
      ? user.user_metadata.username
      : user?.email;

  let files: FileListItem[] = [];
  if (user) {
    const { data } = await supabase
      .from("audio_files")
      .select("id, filename, format, duration_seconds, created_at, waveform_peaks_path")
      .order("created_at", { ascending: false });
    files = data ?? [];
  }

  return (
    <main
      className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 ${
        user ? "gap-8 py-12" : "items-center justify-center gap-4 text-center"
      }`}
    >
      {user ? (
        <>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Welcome back, {username}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Upload a track or open one from the library.
            </p>
          </div>
          <AudioLibrary initialFiles={files} />
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Audio Annotation Tool
          </h1>
          <p className="max-w-md text-zinc-600 dark:text-zinc-400">
            Collaboratively annotate and extract segments from shared MP3/WAV
            files in real-time.
          </p>
          <div className="mt-2 flex gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.08]"
            >
              Log in
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
