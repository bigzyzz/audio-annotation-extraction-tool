"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDemoPersona } from "@/lib/demo-accounts";

export type LoginFormState = {
  error?: string;
};

export async function login(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      return { error: "Incorrect email or password." };
    }
    if (/email not confirmed/i.test(error.message)) {
      return { error: "Please confirm your email before logging in." };
    }
    return { error: error.message };
  }

  redirect("/");
}

/**
 * 1-click login action for pre-configured demo personas (Alice and Bob).
 * Automatically seeds the user account if it does not exist yet.
 */
export async function loginAsDemoUser(
  personaId: string
): Promise<LoginFormState> {
  const persona = getDemoPersona(personaId);
  if (!persona) {
    return { error: "Unknown demo persona." };
  }

  const supabase = await createClient();

  // Try signing in with pre-seeded demo credentials
  let { error } = await supabase.auth.signInWithPassword({
    email: persona.email,
    password: persona.password,
  });

  // If user does not exist yet, auto-seed the demo account on demand
  if (error && /invalid login credentials/i.test(error.message)) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (serviceRoleKey && supabaseUrl) {
      const { createClient: createAdminClient } = await import(
        "@supabase/supabase-js"
      );
      const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { error: adminError } = await adminClient.auth.admin.createUser({
        email: persona.email,
        password: persona.password,
        email_confirm: true,
        user_metadata: { username: persona.username },
      });

      if (!adminError) {
        const retry = await supabase.auth.signInWithPassword({
          email: persona.email,
          password: persona.password,
        });
        error = retry.error;
      } else {
        error = adminError;
      }
    } else {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: persona.email,
        password: persona.password,
        options: { data: { username: persona.username } },
      });

      if (signUpError) {
        return {
          error: `Could not auto-seed demo account: ${signUpError.message}`,
        };
      }

      if (signUpData.session) {
        redirect("/");
      }

      const retry = await supabase.auth.signInWithPassword({
        email: persona.email,
        password: persona.password,
      });
      error = retry.error;
    }
  }

  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      return {
        error:
          "Demo account requires email confirmation. Turn 'Confirm email' OFF in Supabase Dashboard (Auth -> Providers -> Email) for instant demo logins.",
      };
    }
    return { error: error.message };
  }

  redirect("/");
}
