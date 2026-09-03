"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export async function signInWithGoogle(callbackUrl?: string) {
  await signIn("google", { redirectTo: callbackUrl || "/" });
}

/**
 * Email + password.
 *
 * Replaces `signInWithDevPassword`, which sent one shared password from an env
 * var. This calls the real per-user provider in `src/auth.ts`.
 *
 * EVERY failure comes back as the same `invalid_credentials` — a wrong
 * password, an unknown email, an account with no password set and a
 * deactivated account are indistinguishable from out here, deliberately. The
 * provider makes them indistinguishable in TIMING too; telling them apart in
 * the URL afterwards would undo that.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  callbackUrl?: string,
) {
  try {
    await signIn("password", {
      email,
      password,
      redirectTo: callbackUrl || "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const params = new URLSearchParams({ error: "invalid_credentials" });
      if (callbackUrl) params.set("callbackUrl", callbackUrl);
      redirect(`/login?${params.toString()}`);
    }
    throw error;
  }
}
