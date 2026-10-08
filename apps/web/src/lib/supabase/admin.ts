import { createClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";

/**
 * Server-only admin Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses RLS for authorized operations (e.g., deleting extraction jobs and storage files
 * after verifying caller permissions in a Server Action or route).
 * NEVER expose this or import this into client components.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client.",
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
