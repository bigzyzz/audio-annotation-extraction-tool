import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill in your Supabase project's API settings."
  );
}

// Browser/client-side Supabase client (RLS-scoped via anon key). Never use the
// service role key here — that belongs only in apps/worker's server-side client.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
