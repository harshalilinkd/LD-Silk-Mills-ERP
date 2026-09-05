"use client";

import * as React from "react";
import Link from "next/link";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

/**
 * When a Petty Cash screen fails to load.
 *
 * ── WHY THIS MODULE HAS ONE AND THE OTHERS DO NOT ────────────────────────
 *
 * The `(app)` group already has a shared `loading.tsx`, so every route in the
 * ERP acknowledges a click. It has no shared ERROR boundary, and adding one
 * would change what every other module does on a crash — out of scope here.
 *
 * This module gets its own because of what it is. A screen about money that
 * fails halfway is the one place somebody might reasonably wonder whether the
 * failure took their entry with it. So the message answers that question
 * before it is asked: nothing was saved, and nothing was lost.
 *
 * ── THE ERROR ITSELF IS NOT PRINTED ──────────────────────────────────────
 *
 * A stack trace or a Postgres message helps nobody at this screen and can name
 * columns and constraints. Next already logs it server-side, and `digest` is
 * the handle that finds it in those logs — which is why that, and only that,
 * is shown.
 */
export default function PettyCashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[petty-cash]", error);
  }, [error]);

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-status-amber-dim">
        <IconAlertTriangle className="size-6 text-status-amber" />
      </div>

      <h1 className="text-[19px] font-bold tracking-[-0.01em] text-text-1">
        This screen could not be loaded
      </h1>

      <p className="max-w-sm text-[13px] leading-relaxed text-text-3">
        Nothing was saved and nothing was lost — the ledger is exactly as it
        was. Try again, and if it keeps happening, say so and quote the
        reference below.
      </p>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-field bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <IconRefresh className="size-3.5" />
          Try again
        </button>
        <Link
          href="/petty-cash"
          className="inline-flex h-9 items-center rounded-field border border-border bg-surface px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
        >
          Back to the ledger
        </Link>
      </div>

      {error.digest && (
        <p className="num mt-1 text-[11.5px] text-text-3">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
