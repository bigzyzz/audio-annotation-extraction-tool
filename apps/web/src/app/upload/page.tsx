import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/upload-form";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
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

      <div className="flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Upload a track
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            MP3 or WAV only. Duration is filled in after processing.
          </p>
        </div>
        <UploadForm />
      </div>
    </main>
  );
}
