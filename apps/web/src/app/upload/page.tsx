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
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to library
        </Link>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Upload a track
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          MP3 or WAV only. Duration is filled in after processing.
        </p>
      </div>
      <UploadForm />
    </div>
  );
}
