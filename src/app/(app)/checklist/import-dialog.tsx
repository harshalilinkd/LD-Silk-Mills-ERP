"use client";

import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconFileSpreadsheet,
  IconUpload,
} from "@tabler/icons-react";

import { countVerdicts, type ImportRow } from "@/lib/checklist/import";
import { cn } from "@/lib/utils";
import { ErrorNote, Modal, PrimaryButton, QuietButton } from "./parts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Paste a spreadsheet, see exactly what will happen, then let it happen
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three screens use this — doers, holidays, tasks — with different columns and
 * different validation, so the parsing is passed IN. What is shared is the
 * shape of the moment, and it is the same shape every time:
 *
 *   paste or choose a file  →  a line-by-line verdict  →  confirm
 *
 * ── THE PREVIEW IS THE WHOLE POINT ───────────────────────────────────────
 *
 * An import that just runs and reports "142 rows added, 8 failed" leaves
 * somebody to work out which eight, from a spreadsheet of two hundred, with no
 * line numbers. So nothing is written until the table below has been shown,
 * every line carries its own verdict and reason, and the button says how many
 * rows it is about to add rather than saying "Import".
 *
 * Three verdicts, and `skip` is deliberately not `error`: a doer already in
 * the list is a row to step over, not a mistake to go and fix. Pasting the
 * same sheet twice should read as "nothing new", not as a wall of failures.
 *
 * ── THE PREVIEW IS NOT THE VALIDATION ────────────────────────────────────
 *
 * All of this runs in the browser, which makes it a courtesy and never a
 * guarantee. The server action re-parses the raw text from scratch and applies
 * the same rules, because anything decided here can be edited by whoever is
 * looking at it.
 */

export type ImportDialogProps<T> = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What one line should look like, shown above the box. */
  formatHint: React.ReactNode;
  /** A ready-made example somebody can copy and edit. */
  sample: string;
  columns: string[];
  /** Runs in the browser for the preview. The server repeats it. */
  parse: (text: string) => ImportRow<T>[];
  /** Sends the RAW TEXT — never the parsed rows — to a server action. */
  submit: (text: string) => Promise<{ added: number; skipped: number; failed: number }>;
  onDone: () => void;
};

export function ImportDialog<T>({
  open,
  onClose,
  title,
  formatHint,
  sample,
  columns,
  parse,
  submit,
  onDone,
}: ImportDialogProps<T>) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ added: number; skipped: number; failed: number } | null>(null);

  const rows = React.useMemo(() => (text.trim() ? parse(text) : []), [text, parse]);
  const counts = React.useMemo(() => countVerdicts(rows), [rows]);

  const reset = () => {
    setText("");
    setError(null);
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const readFile = async (file: File) => {
    setError(null);
    try {
      setText(await file.text());
    } catch {
      setError("That file could not be read. Save it as CSV and try again.");
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await submit(text);
      setResult(r);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={title}
      subtitle={
        result
          ? "Finished. Here is what was written."
          : "Copy the cells straight out of Excel and paste them below, or choose a CSV file."
      }
      footer={
        result ? (
          <PrimaryButton onClick={close}>Done</PrimaryButton>
        ) : (
          <>
            {text && (
              <QuietButton onClick={reset} disabled={busy}>
                <IconArrowBackUp className="size-3.5" />
                Start again
              </QuietButton>
            )}
            <QuietButton onClick={close} disabled={busy}>
              Cancel
            </QuietButton>
            <PrimaryButton onClick={run} busy={busy} disabled={counts.add === 0}>
              {counts.add === 0
                ? "Nothing to add"
                : `Add ${counts.add} row${counts.add === 1 ? "" : "s"}`}
            </PrimaryButton>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            <Tally label="Added" n={result.added} tone="green" />
            <Tally label="Already there" n={result.skipped} tone="grey" />
            <Tally label="Refused" n={result.failed} tone={result.failed ? "red" : "grey"} />
          </div>
          {result.failed > 0 && (
            <p className="text-[12.5px] leading-relaxed text-text-3">
              The refused lines were left alone — nothing was half-written.
              Correct them in your spreadsheet and paste again; the rows that
              went in this time will simply be skipped.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-field border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-text-2">{formatHint}</p>
            <pre className="mt-1.5 overflow-x-auto rounded-sm bg-surface px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-text-3">
              {sample}
            </pre>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="Paste here…"
            className="w-full resize-y rounded-field border border-border bg-surface px-3 py-2 font-mono text-[12.5px] text-text-1 outline-none placeholder:text-text-placeholder focus:border-primary/50 focus:ring-3 focus:ring-primary/15"
          />

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1">
              <IconUpload className="size-3.5" />
              Choose a CSV file
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {rows.length > 0 && (
              <span className="text-[12px] text-text-3">
                {rows.length} line{rows.length === 1 ? "" : "s"} read ·{" "}
                <strong className="font-semibold text-status-green">{counts.add} to add</strong>
                {counts.skip > 0 && <> · {counts.skip} already there</>}
                {counts.error > 0 && (
                  <> · <strong className="font-semibold text-status-red">{counts.error} refused</strong></>
                )}
              </span>
            )}
          </div>

          <ErrorNote>{error}</ErrorNote>

          {rows.length > 0 && (
            <div className="max-h-[40vh] overflow-auto rounded-field border border-border">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 border-b border-border bg-surface-2 px-2.5 py-1.5 text-[10.5px] font-bold tracking-[0.05em] text-text-3 uppercase">
                      #
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c}
                        className="sticky top-0 z-10 border-b border-border bg-surface-2 px-2.5 py-1.5 text-[10.5px] font-bold tracking-[0.05em] whitespace-nowrap text-text-3 uppercase"
                      >
                        {c}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 border-b border-border bg-surface-2 px-2.5 py-1.5 text-[10.5px] font-bold tracking-[0.05em] text-text-3 uppercase">
                      Verdict
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.line}
                      className={cn(
                        "border-b border-border last:border-0",
                        r.verdict === "error" && "bg-status-red-dim/30",
                        r.verdict === "skip" && "opacity-60",
                      )}
                    >
                      <td className="px-2.5 py-1.5 text-[12px] text-text-3 tabular-nums">
                        {r.line}
                      </td>
                      {columns.map((_, i) => (
                        <td
                          key={i}
                          className="max-w-[240px] truncate px-2.5 py-1.5 text-[12.5px] text-text-2"
                          title={r.raw[i] ?? ""}
                        >
                          {r.raw[i] || <span className="text-text-3">—</span>}
                        </td>
                      ))}
                      <td className="px-2.5 py-1.5 text-[12px] whitespace-nowrap">
                        {r.verdict === "add" && (
                          <span className="inline-flex items-center gap-1 font-semibold text-status-green">
                            <IconCheck className="size-3.5" /> Add
                          </span>
                        )}
                        {r.verdict === "skip" && (
                          <span className="text-text-3">{r.reason ?? "Already there"}</span>
                        )}
                        {r.verdict === "error" && (
                          <span className="inline-flex items-center gap-1 font-semibold text-status-red">
                            <IconAlertTriangle className="size-3.5" />
                            {r.reason ?? "Refused"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length === 0 && text.trim() === "" && (
            <div className="flex items-center gap-2 rounded-field border border-dashed border-border px-3 py-6 text-[12.5px] text-text-3">
              <IconFileSpreadsheet className="size-4 shrink-0" />
              Nothing pasted yet. Every line will be checked and shown back to
              you here before anything is saved.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Tally({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "green" | "red" | "grey";
}) {
  return (
    <div className="rounded-field border border-border bg-surface-2 px-3 py-2">
      <div className="text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "num mt-0.5 text-[19px] font-bold",
          tone === "green" && "text-status-green",
          tone === "red" && "text-status-red",
          tone === "grey" && "text-text-1",
        )}
      >
        {n}
      </div>
    </div>
  );
}
