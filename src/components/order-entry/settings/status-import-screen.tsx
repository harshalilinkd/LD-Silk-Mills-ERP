"use client";

// Bringing the old sheet's PRODUCTION STATUS in — the screen.
//
// The orders importer's screen is a mapping table: one dropdown per target
// column, because every heading in that sheet is unique. This one cannot be,
// and the reason is worth reading in `status-layout.ts` before changing
// anything here — the status sheet's headings are `Planned, Actual, Status,
// Time Delay` repeated eight times, so the stage a column belongs to lives in a
// merged cell one row above.
//
// So this screen CONFIRMS a detected layout rather than asking for one: seven
// rows, one per stage, each showing which columns it found and a real value out
// of the file. A person can see at a glance that Dispatch is reading the
// dispatch columns, which is the thing twenty-five dropdowns would have made
// impossible to check.

import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconCircleCheck,
  IconFileSpreadsheet,
  IconInfoCircle,
  IconUpload,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import {
  ACCEPTED,
  ImportFileError,
  parseImportFile,
} from "@/lib/order-entry/import/parse-file";
import { suggestMapping } from "@/lib/order-entry/import/fields";
import {
  detectStatusLayout,
  StatusLayoutError,
  type StatusLayout,
} from "@/lib/order-entry/import/status-layout";
import {
  buildStatusPlan,
  collectStatusRows,
  orderNosInFile,
  type ExistingLine,
  type StatusColumnMap,
  type StatusPlan,
} from "@/lib/order-entry/import/status-build";
import { STAGE_LABELS } from "@/lib/order-entry/workflow-constants";
import type { Issue, SheetData } from "@/lib/order-entry/import/types";
import { cn } from "@/lib/utils";

type Step = "file" | "confirm" | "done";

type Report = {
  counts: {
    considered: number;
    matched: number;
    unmatched: number;
    linesUpdated: number;
    stagesWritten: number;
    backfilled: number;
  };
  results: {
    line: number;
    orderNo: string;
    designNo: string;
    status: "updated" | "nothing" | "error";
    stages?: number;
    reason?: string;
  }[];
};

/** As many rows as one POST carries. Small: each is a handful of short cells. */
const BATCH = 400;

function chunk<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

export function StatusImportScreen() {
  const [step, setStep] = React.useState<Step>("file");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [sheets, setSheets] = React.useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = React.useState(0);
  const [layout, setLayout] = React.useState<StatusLayout | null>(null);
  const [map, setMap] = React.useState<StatusColumnMap | null>(null);
  const [lines, setLines] = React.useState<ExistingLine[] | null>(null);
  const [report, setReport] = React.useState<Report | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [showAllIssues, setShowAllIssues] = React.useState(false);

  const sheet = sheets[sheetIdx];

  // The preview. Pure, and re-run whenever the matched lines arrive.
  const plan = React.useMemo<StatusPlan | null>(() => {
    if (!sheet || !layout || !map || !lines) return null;
    return buildStatusPlan({ raw: sheet.raw, layout, map, lines });
  }, [sheet, layout, map, lines]);

  /** A real value from the file under a column, so a guess can be checked. */
  const sampleAt = React.useCallback(
    (col: number | null): string => {
      if (col == null || !sheet || !layout) return "";
      for (let r = layout.headerRow + 1; r < sheet.raw.length; r++) {
        const v = (sheet.raw[r]?.[col] ?? "").trim();
        if (v) return v.length > 22 ? v.slice(0, 22) + "…" : v;
      }
      return "";
    },
    [sheet, layout],
  );

  async function lookupLines(s: SheetData, lay: StatusLayout, m: StatusColumnMap) {
    const nos = orderNosInFile(s.raw, lay, m);
    if (!nos.length) {
      setLines([]);
      return;
    }
    const res = await fetch("/api/order-entry/import/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "lookup", orderNos: nos }),
    });
    const json = (await res.json()) as { data?: { lines: ExistingLine[] }; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Could not read the orders already in the system.");
    setLines(json.data?.lines ?? []);
  }

  async function applySheet(s: SheetData, all: SheetData[], idx: number) {
    const lay = detectStatusLayout(s.raw);
    const guess = suggestMapping(lay.headers);
    const m: StatusColumnMap = {
      order_no: guess.order_no,
      quality: guess.quality,
      design_no: guess.design_no,
      qty_mtr: guess.qty_mtr,
      // Not written anywhere — read only to prove the order found is the order
      // the sheet meant. The two numbering series overlap.
      party_name: guess.party_name,
      order_date: guess.order_date,
    };
    setSheets(all);
    setSheetIdx(idx);
    setLayout(lay);
    setMap(m);
    setLines(null);
    setStep("confirm");
    await lookupLines(s, lay, m);
  }

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const parsed = await parseImportFile(file);
      const use = parsed.filter((s) => s.raw.length);
      if (!use.length) throw new ImportFileError("That file has no rows in it.");

      // The status tab is often not the first one in the workbook, so the tab
      // that HAS a stage layout is chosen rather than the tab that is first.
      let idx = -1;
      for (let i = 0; i < use.length; i++) {
        try {
          detectStatusLayout(use[i].raw);
          idx = i;
          break;
        } catch {
          /* not this one */
        }
      }
      if (idx < 0)
        throw new StatusLayoutError(
          "No tab in that file has a production-status layout — a heading row repeating `Planned` and `Actual`, one pair per stage. If you exported the orders tab, use the Orders tab above instead.",
        );
      await applySheet(use[idx], use, idx);
    } catch (e) {
      setError(
        e instanceof ImportFileError || e instanceof StatusLayoutError
          ? e.message
          : e instanceof Error
            ? e.message
            : "That file could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function pickSheet(i: number) {
    setBusy(true);
    setError(null);
    try {
      await applySheet(sheets[i], sheets, i);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That tab could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!sheet || !layout || !map) return;
    setBusy(true);
    setError(null);
    const collected = collectStatusRows(sheet.raw, layout, map);
    const batches = chunk(collected.rows);
    setProgress({ done: 0, total: collected.rows.length });

    const merged: Report = {
      counts: {
        considered: 0, matched: 0, unmatched: 0,
        linesUpdated: 0, stagesWritten: 0, backfilled: 0,
      },
      results: [],
    };

    try {
      for (const batch of batches) {
        const res = await fetch("/api/order-entry/import/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "write", rows: batch, layout, map }),
        });
        const json = (await res.json()) as {
          data?: { results: Report["results"]; counts: Record<string, number> };
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "The import failed.");
        const d = json.data!;
        merged.results.push(...d.results);
        merged.counts.considered += d.counts.considered ?? 0;
        merged.counts.matched += d.counts.matched ?? 0;
        merged.counts.unmatched += d.counts.unmatched ?? 0;
        merged.counts.linesUpdated += d.counts.linesUpdated ?? 0;
        merged.counts.stagesWritten += d.counts.stagesWritten ?? 0;
        merged.counts.backfilled += d.counts.backfilled ?? 0;
        setProgress((p) => (p ? { ...p, done: p.done + batch.length } : p));
      }
      setReport(merged);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function reset() {
    setStep("file");
    setSheets([]);
    setLayout(null);
    setMap(null);
    setLines(null);
    setReport(null);
    setError(null);
    setShowAllIssues(false);
  }

  // ── THE FILE'S OWN ISSUES ARE NEVER TRUNCATED AWAY ────────────────────
  //
  // They are the ones about the WHOLE import — a stage column that is not
  // being read at all, twenty thousand rows skipped — and there are only ever
  // a handful. Sorted in with the rest by level they come out as `note`, so on
  // a real file forty per-row notes pushed "21,266 rows were skipped" off the
  // bottom of the list. The thing that describes the file cannot be the thing
  // that gets cut.
  const fileIssues: Issue[] = plan?.fileIssues ?? [];
  const rowIssues: Issue[] = React.useMemo(() => {
    if (!plan) return [];
    const rank = { error: 0, warn: 1, note: 2 } as const;
    return plan.rows
      .flatMap((r) => r.issues)
      .sort((a, b) => rank[a.level] - rank[b.level] || a.line - b.line);
  }, [plan]);
  const issues = [...fileIssues, ...rowIssues];
  const shown = showAllIssues ? issues : [...fileIssues, ...rowIssues.slice(0, 40)];

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-card border border-status-red/40 bg-status-red-dim px-4 py-3 text-[13px] text-status-red">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── step 1: the file ───────────────────────────────────────────── */}
      {/* A STRIP, NOT A ROOM, AND NOT A FRAME INSIDE A FRAME. This was a
          230px-tall card with a button floating in the middle of it; then a
          dashed box inside a card, which is two borders drawing the same edge.
          A file chooser is one short action: one row, the whole of which is the
          click target. It stacks below `sm`, where a row would put the button
          off the edge. */}
      {step === "file" ? (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-card px-5 py-5 text-center",
            "border border-dashed border-border-strong bg-surface transition-colors",
            "hover:border-primary hover:bg-chip",
            "sm:flex-row sm:justify-between sm:text-left",
          )}
        >
          <input
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <span className="flex items-center gap-3">
            <IconFileSpreadsheet className="size-7 shrink-0 text-text-3" />
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold text-text-1">
                Choose the exported status sheet
              </span>
              <span className="text-[11.5px] text-text-3">CSV, TSV or XLSX</span>
            </span>
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-field bg-primary px-4 py-2",
              "text-[13px] font-semibold text-primary-foreground",
            )}
          >
            {busy ? <Spinner className="size-4" /> : <IconUpload className="size-4" />}
            {busy ? "Reading…" : "Choose a file"}
          </span>
        </label>
      ) : null}

      {/* ── step 2: confirm what it found ──────────────────────────────── */}
      {step === "confirm" && layout && map ? (
        <>
          {sheets.length > 1 ? (
            <Card size="sm" className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
              <span className="text-[12px] font-semibold text-text-2">Tab</span>
              {sheets.map((s, i) => (
                <button
                  key={s.name + i}
                  type="button"
                  onClick={() => void pickSheet(i)}
                  className={cn(
                    "rounded-field px-3 py-1.5 text-[12.5px]",
                    i === sheetIdx
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-chip text-text-2 hover:text-text-1",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </Card>
          ) : null}

          <Card size="sm" className="flex flex-col gap-3 px-(--card-spacing)">
            <div>
              <h3 className="text-[13.5px] font-bold text-text-1">Which columns are which</h3>
              <p className="mt-0.5 text-[12px] text-text-3">
                Headings found on row {layout.headerRow + 1}
                {layout.labelRow != null ? `, stage names on row ${layout.labelRow + 1}` : ""}. Under
                each is the first real value in that column, so a wrong guess shows itself.
              </p>
            </div>

            <HScroll>
              <Table className="min-w-[720px]">
                <THead>
                  <Tr>
                    <Th>Stage in this system</Th>
                    <Th>Column block in the sheet</Th>
                    <Th>Actual date reads</Th>
                    <Th>Done? reads</Th>
                  </Tr>
                </THead>
                <TBody>
                  {layout.blocks.map((b) => (
                    <Tr key={b.plannedCol}>
                      <Td>
                        {b.stageKey ? (
                          <span className="font-semibold text-text-1">
                            {STAGE_LABELS[b.stageKey]}
                          </span>
                        ) : (
                          <span className="text-status-amber">Not imported</span>
                        )}
                      </Td>
                      <Td className="text-text-2">{b.label || "(no name above it)"}</Td>
                      <Td className="num text-text-2">{sampleAt(b.actualCol) || "—"}</Td>
                      <Td className="num text-text-2">{sampleAt(b.statusCol) || "—"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </HScroll>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Order no", map.order_no],
                  ["Fabric", map.quality],
                  ["Design no", map.design_no],
                  ["Qty (checked only)", map.qty_mtr],
                ] as const
              ).map(([label, col]) => (
                <div key={label} className="rounded-field bg-chip px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase text-text-2">{label}</div>
                  <div className="mt-0.5 text-[12.5px] text-text-1">
                    {col == null ? "— not found —" : layout.headers[col]}
                  </div>
                  <div className="text-[11.5px] text-text-3">{sampleAt(col) || " "}</div>
                </div>
              ))}
            </div>
          </Card>

          {!lines ? (
            <Card size="sm" className="flex items-center gap-2 py-6 px-(--card-spacing)">
              <Spinner className="size-4" />
              <span className="text-[13px] text-text-2">
                Looking up the orders this file names…
              </span>
            </Card>
          ) : null}

          {plan ? (
            <>
              <Card size="sm" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 px-(--card-spacing)">
                {(
                  [
                    ["Rows with a design", plan.counts.considered],
                    ["Lines matched", plan.counts.matched],
                    ["Not found", plan.counts.unmatched],
                    ["Stages to tick", plan.counts.stagesToTick],
                    ["Filled in behind", plan.counts.stagesBackfilled],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-field bg-chip px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase text-text-2">{label}</div>
                    <div className="num mt-0.5 text-[19px] font-bold text-text-1">{n}</div>
                  </div>
                ))}
              </Card>

              {issues.length ? (
                <Card size="sm" className="flex flex-col gap-2 px-(--card-spacing)">
                  <h3 className="text-[13.5px] font-bold text-text-1">
                    What it changed, and what it could not
                  </h3>
                  <HScroll>
                    <Table className="min-w-[640px]">
                      <THead>
                        <Tr>
                          <Th className="w-16">Line</Th>
                          <Th className="w-20">Level</Th>
                          <Th>What</Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {shown.map((i, n) => (
                          <Tr key={`${i.line}-${n}`}>
                            <Td className="num text-text-2">{i.line}</Td>
                            <Td>
                              <span
                                className={cn(
                                  "text-[11.5px] font-semibold uppercase",
                                  i.level === "error"
                                    ? "text-status-red"
                                    : i.level === "warn"
                                      ? "text-status-amber"
                                      : "text-text-3",
                                )}
                              >
                                {i.level}
                              </span>
                            </Td>
                            <Td className="text-text-2">{i.message}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  </HScroll>
                  {issues.length > shown.length ? (
                    <button
                      type="button"
                      onClick={() => setShowAllIssues(true)}
                      className="self-start text-[12.5px] font-semibold text-primary"
                    >
                      Show all {issues.length}
                    </button>
                  ) : null}
                </Card>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  <IconArrowLeft className="size-4" />
                  Start again
                </Button>
                <Button onClick={() => void run()} disabled={busy || !plan.counts.matched}>
                  {busy ? <Spinner className="size-4" /> : <IconCheck className="size-4" />}
                  {busy
                    ? progress
                      ? `Importing ${progress.done} of ${progress.total}…`
                      : "Importing…"
                    : `Tick ${plan.counts.stagesToTick + plan.counts.stagesBackfilled} stages on ${plan.counts.matched} lines`}
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {/* ── step 3: what happened ──────────────────────────────────────── */}
      {step === "done" && report ? (
        <>
          <Card size="sm" className="flex flex-col gap-3 px-(--card-spacing)">
            <div className="flex items-center gap-2">
              <IconCircleCheck className="size-5 text-status-green" />
              <h3 className="text-[15px] font-bold text-text-1">
                {report.counts.linesUpdated} lines updated,{" "}
                {report.counts.stagesWritten} stages ticked
              </h3>
            </div>
            {report.counts.backfilled ? (
              <p className="flex items-start gap-2 text-[13px] text-text-2">
                <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-status-amber" />
                <span>
                  {report.counts.backfilled} of those were filled in behind a later stage the
                  sheet had ticked — they are listed in the table above with the line they
                  came from.
                </span>
              </p>
            ) : null}
            {report.counts.unmatched ? (
              <p className="text-[13px] text-text-2">
                {report.counts.unmatched} rows matched no line in the system. Import the orders
                sheet first, or check the fabric and design spellings.
              </p>
            ) : null}
          </Card>

          {report.results.some((r) => r.status === "error") ? (
            <Card size="sm" className="flex flex-col gap-2 px-(--card-spacing)">
              <h3 className="text-[13.5px] font-bold text-text-1">Rows that did not go in</h3>
              <HScroll>
                <Table className="min-w-[640px]">
                  <THead>
                    <Tr>
                      <Th className="w-16">Line</Th>
                      <Th>Order</Th>
                      <Th>Design</Th>
                      <Th>Why</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {report.results
                      .filter((r) => r.status === "error")
                      .map((r, n) => (
                        <Tr key={`${r.line}-${n}`}>
                          <Td className="num text-text-2">{r.line}</Td>
                          <Td className="text-text-1">{r.orderNo}</Td>
                          <Td className="text-text-2">{r.designNo}</Td>
                          <Td className="text-text-2">{r.reason}</Td>
                        </Tr>
                      ))}
                  </TBody>
                </Table>
              </HScroll>
            </Card>
          ) : null}

          <div>
            <Button variant="ghost" onClick={reset}>
              <IconArrowLeft className="size-4" />
              Import another file
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
