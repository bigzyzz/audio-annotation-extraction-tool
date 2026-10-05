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
    <header className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-3.5 dark:border-zinc-800">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
        >
          Audio Annotation Tool
        </Link>

        {user && (
          <nav className="flex items-center gap-2">
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
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              Library
            </Link>
            <Link
              href="/upload"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload
            </Link>
          </nav>
        )}
      </div>

      {user ? (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {username}
            </span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-black dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              Log out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm font-medium">
          <Link
            href="/login"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-black dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
}
