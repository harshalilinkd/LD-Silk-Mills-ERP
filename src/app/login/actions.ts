"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function signInWithGoogle(callbackUrl?: string) {
  await signIn("google", { redirectTo: callbackUrl || "/" });
}

// TEMPORARY — see the comment on the "dev-password" provider in
// src/auth.ts. Remove this along with that provider before Phase 2.
export async function signInWithDevPassword(
  email: string,
  password: string,
  callbackUrl?: string,
) {
  try {
    await signIn("dev-password", {
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
