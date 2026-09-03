"use client";

import * as React from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field you can look at.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * A user reported "I'm adding the current password right, still showing
 * wrong". The most likely cause was invisible: the field carries
 * `autoComplete="current-password"`, so a browser can silently autofill it
 * with a saved credential from somewhere else. You see dots, you assume they
 * are what you typed, and the form refuses you with no way to check. A masked
 * field that cannot be unmasked turns every mismatch into a mystery.
 *
 * So every password field in this app can be revealed. It is not a
 * convenience — on a screen whose whole job is "prove you know this string",
 * being unable to see the string is a design fault.
 *
 * ── THE BUTTON IS REAL ────────────────────────────────────────────────────
 *
 * A `<button type="button">`, so it never submits the form it sits inside; it
 * carries an `aria-label` that changes with state, and `aria-pressed`, so a
 * screen reader knows both what it does and whether the password is currently
 * visible. `tabIndex={-1}` is deliberately NOT set: somebody who cannot use a
 * mouse is exactly who needs to check what a field contains.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={shown ? "text" : "password"}
        // Room for the button, so a long password never runs underneath it.
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-[6px] text-text-3 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        {shown ? (
          <IconEyeOff className="size-4" stroke={1.7} />
        ) : (
          <IconEye className="size-4" stroke={1.7} />
        )}
      </button>
    </div>
  );
}
