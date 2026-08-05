import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — copy .env.example to .env and fill in your Supabase project's API settings."
  );
}

// Service-role client: bypasses RLS. Worker acts on behalf of all users to
// read job rows, read/write Storage, and update job status. Never expose
// this key or this client to apps/web.
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
