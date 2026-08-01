"use server";

import { redirect } from "next/navigation";

import { authenticate, createSession } from "@/lib/auth";
import { copy } from "@/lib/copy";

export interface SignInState {
  error: string | null;
}

/**
 * Sign in.
 *
 * The failure message is identical for an unknown email and a wrong password,
 * and `authenticate` burns the same scrypt work in both cases — so this form
 * cannot be used to find out who has an account.
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/kitchen");

  if (!email || !password) {
    return { error: copy.errors.signInFailed };
  }

  const staff = authenticate(email, password);
  if (!staff) {
    return { error: copy.errors.signInFailed };
  }

  await createSession(staff);

  // Only ever redirect within this app — a `next` of `https://elsewhere` would
  // turn the login form into an open redirect.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/kitchen");
}
