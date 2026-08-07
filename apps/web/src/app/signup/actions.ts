"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignupFormState = {
  error?: string;
  checkEmail?: boolean;
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export async function signup(
  _prevState: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim();

  if (!email || !password || !username) {
    return { error: "Email, password, and username are all required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        "Username must be 3-20 characters — letters, numbers, or underscores only.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    // profiles.username has a unique constraint enforced by a trigger on
    // auth.users insert (see handle_new_user() in the core schema
    // migration). A duplicate username fails that trigger and rolls back
    // the whole signUp() call. GoTrue doesn't forward the underlying
    // Postgres error message for security — verified empirically that this
    // surfaces as a generic AuthRetryableFetchError, status 500, with an
    // opaque "{}" message (no distinguishable error code). Status 500 from
    // signUp() is otherwise rare, so treat it as "likely duplicate username"
    // — best available signal without a schema change (e.g. a pre-flight
    // `is_username_taken` RPC) to check availability before submitting.
    if (error.status === 500) {
      return { error: "That username is already taken — pick another one." };
    }
    if (/already registered/i.test(error.message)) {
      return {
        error: "That email is already registered. Try logging in instead.",
      };
    }
    return { error: error.message };
  }

  if (!data.session) {
    // Supabase project has "Confirm email" enabled — no session is issued
    // until the user clicks the confirmation link.
    return { checkEmail: true };
  }

  redirect("/");
}
