import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@audio-tool/shared-types";

// Browser Supabase client (RLS-scoped via anon key), for use in Client
// Components. Session is stored in cookies (not localStorage) so the server
// client below can read the same session during SSR/Server Actions.
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill in your Supabase project's API settings."
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
