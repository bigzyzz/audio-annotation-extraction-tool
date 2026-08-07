"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
