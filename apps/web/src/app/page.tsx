import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    typeof user?.user_metadata?.username === "string"
      ? user.user_metadata.username
      : user?.email;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      {user ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Welcome back, {username}
          </h1>
          <p className="max-w-md text-zinc-600 dark:text-zinc-400">
            File upload, playback, and annotation are coming in the next
            iterations.
          </p>
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
