"use client";

// "Download the template" — on both import tabs.
//
// ── THE TEMPLATE IS BUILT, NOT SERVED ─────────────────────────────────────
//
// The obvious version of this is two .xlsx files in `public/`. It is also the
// version that goes stale silently: the day a column is added to
// `IMPORT_FIELDS`, or the day `on_hold` becomes a stage, the file on disk still
// describes the importer as it was, and the person filling it in has no way to
// tell. Generating it from the same constants the importer reads means the
// template cannot describe a shape the importer does not accept.
//
// ExcelJS is a large dependency and is imported only when the button is
// actually pressed — the same rule the .xlsx PARSER follows, so somebody
// importing a CSV never downloads it.

import * as React from "react";
import { IconDownload } from "@tabler/icons-react";

import { Spinner } from "@/components/ui/spinner";
import { saveBlob } from "@/lib/order-entry/import/templates";
import { cn } from "@/lib/utils";

export function TemplateButton({
  label,
  file,
  build,
}: {
  label: string;
  file: string;
  /** Deferred so the workbook code is only fetched on a click. */
  build: () => Promise<Blob>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      saveBlob(await build(), file);
    } catch (e) {
      // A failed download is otherwise completely silent — the button just
      // stops spinning and nothing arrives.
      setError(e instanceof Error ? e.message : "The template could not be built.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Button and note on ONE line. Stacked, the note was three lines of 11px
    // grey hanging off the bottom of a button and read as an orphan.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className={cn(
          "inline-flex w-fit cursor-pointer items-center gap-2 rounded-field border border-border",
          "bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-1",
          "hover:bg-chip disabled:cursor-default disabled:opacity-60",
        )}
      >
        {busy ? <Spinner className="size-4" /> : <IconDownload className="size-4" />}
        {busy ? "Building…" : label}
      </button>
      <p className="text-[11.5px] leading-snug text-text-3">
        The right columns, two example rows and a page of notes — delete the
        examples before you import.
      </p>
      {error ? <p className="text-[11.5px] text-status-red">{error}</p> : null}
    </div>
  );
}
