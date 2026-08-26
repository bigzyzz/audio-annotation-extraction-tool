import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";

// Server Component: reads the session once per request via the server
// Supabase client, so the signed-in state is correct on first paint (no
// client-side flash of the logged-out state).
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Username is set once at signup via signUp()'s options.data and mirrored
  // into user_metadata — good enough for display without an extra profiles
  // query. Revisit if usernames become editable after signup.
  const username =
    typeof user?.user_metadata?.username === "string"
      ? user.user_metadata.username
      : user?.email;

  return (
    <header className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link
        href="/"
        className="text-sm font-semibold text-black dark:text-zinc-50"
      >
        Audio Annotation Tool
      </Link>

      {user ? (
        <div className="flex items-center gap-4 text-sm">
          <Link href="/upload" className="font-medium text-black dark:text-zinc-50">
            Upload
          </Link>
          <span className="text-zinc-600 dark:text-zinc-400">{username}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.08]"
            >
              Log out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm font-medium">
          <Link href="/login" className="text-black dark:text-zinc-50">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-foreground px-3 py-1.5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
}
