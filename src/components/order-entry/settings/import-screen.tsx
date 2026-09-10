"use client";

// Bringing the old Google Sheet in — the screen.
//
// Four steps, and the third is the one that matters: NOTHING is written until
// somebody has seen what the file will do. The old sheet is half a financial
// year of hand-typed data and the owner's own words were that it will have
// mistakes in it, so the screen is built around showing them rather than
// around being quick.
//
// ── EVERY STEP IS REVERSIBLE UNTIL THE LAST ONE ───────────────────────────
//
// Choose a different file, a different tab, a different column: the preview
// redraws. Only "Import" writes, and even that is safe to run again — an order
// number already in the system is skipped, so a second run of a corrected file
// adds only what was missing.

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
import {
  IMPORT_FIELDS,
  missingRequired,
  suggestMapping,
} from "@/lib/order-entry/import/fields";
import { buildPlan, type MasterLists } from "@/lib/order-entry/import/build";
import { normaliseName } from "@/lib/order-entry/import/coerce";
import type {
  ColumnMap,
  ImportPlan,
  SheetData,
  UnknownName,
} from "@/lib/order-entry/import/types";
import { cn } from "@/lib/utils";

/**
 * How many source rows go in one request.
 *
 * The batch is cut only AT a row that carries its own order number, so an
 * order can never be split across two requests — which would lose the half
 * that inherited its number, or file it as a second order. See the route.
 */
const CHUNK_ROWS = 1200;

type Step = "file" | "map" | "done";

type Report = {
  added: number;
  skipped: number;
  failed: number;
  lines: number;
  mastersAdded: number;
  results: { orderNo: string; status: string; reason?: string; lines?: number }[];
};

const selectCls = cn(
  "h-8 w-full min-w-0 rounded-field border border-border-strong bg-surface px-2",
  "text-[13px] text-text-1 outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/25",
);

export function ImportScreen({
  masterValues,
}: {
  /** Every master list value, by category, read on the server. */
  masterValues: Record<string, string[]>;
}) {
  const [step, setStep] = React.useState<Step>("file");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [sheets, setSheets] = React.useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = React.useState(0);
  const [map, setMap] = React.useState<ColumnMap>({});
  const [addNames, setAddNames] = React.useState<Set<string>>(new Set());
  const [report, setReport] = React.useState<Report | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [showAllIssues, setShowAllIssues] = React.useState(false);

  const masters = React.useMemo<MasterLists>(() => {
    const out = {} as MasterLists;
    for (const c of ["PARTY", "FABRIC", "AGENT", "SALES_PERSON", "TRANSPORT", "HASTE"] as const) {
      const m = new Map<string, string>();
      for (const v of masterValues[c] ?? []) {
        const n = normaliseName(v);
        if (n && !m.has(n)) m.set(n, v);
      }
      out[c] = m;
    }
    return out;
  }, [masterValues]);

  const sheet = sheets[sheetIdx];

  // The preview. Recomputed on every mapping change — it is pure, and on six
  // thousand rows it is a few milliseconds.
  //
  // `existingOrderNos` is EMPTY here on purpose: the browser has no business
  // knowing which order numbers exist, and the server re-runs this against the
  // real table anyway. So the preview never claims an order will be skipped —
  // it says what the FILE contains, and the report says what happened.
  const plan = React.useMemo<ImportPlan | null>(() => {
    if (!sheet || missingRequired(map).length) return null;
    return buildPlan({
      rows: sheet.rows,
      map,
      existingOrderNos: new Set(),
      masters,
    });
  }, [sheet, map, masters]);

  React.useEffect(() => {
    // Everything unknown is ticked by default: a name in half a year of real
    // orders belongs on the list far more often than not, and an unticked one
    // means the order imports but cannot be found by picking its own party.
    if (plan) setAddNames(new Set(plan.unknown.map((u) => `${u.category}::${u.value}`)));
  }, [plan]);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseImportFile(file);
      const withRows = parsed.filter((s) => s.rows.length > 0);
      const use = withRows.length ? withRows : parsed;
      setSheets(use);
      setSheetIdx(0);
      setMap(suggestMapping(use[0]?.headers ?? []));
      setStep("map");
    } catch (e) {
      setError(
        e instanceof ImportFileError
          ? e.message
          : `That file could not be read. ${e instanceof Error ? e.message : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }

  function pickSheet(i: number) {
    setSheetIdx(i);
    setMap(suggestMapping(sheets[i]?.headers ?? []));
  }

  /** Contiguous row ranges, each starting on a row that has an order number. */
  function chunk(rows: string[][]): { rows: string[][]; firstLine: number }[] {
    const col = map.order_no as number;
    const out: { rows: string[][]; firstLine: number }[] = [];
    let start = 0;
    for (let i = 1; i < rows.length; i++) {
      const hasNo = String(rows[i][col] ?? "").trim() !== "";
      if (hasNo && i - start >= CHUNK_ROWS) {
        out.push({ rows: rows.slice(start, i), firstLine: start + 2 });
        start = i;
      }
    }
    out.push({ rows: rows.slice(start), firstLine: start + 2 });
    return out;
  }

  async function runImport() {
    if (!sheet || !plan) return;
    setError(null);
    setBusy(true);
    setReport(null);

    const batches = chunk(sheet.rows);
    setProgress({ done: 0, total: batches.length });

    const total: Report = {
      added: 0, skipped: 0, failed: 0, lines: 0, mastersAdded: 0, results: [],
    };
    const toAdd = plan.unknown
      .filter((u) => addNames.has(`${u.category}::${u.value}`))
      .map((u) => ({ category: u.category, value: u.value }));

    try {
      for (let i = 0; i < batches.length; i++) {
        const res = await fetch("/api/order-entry/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: batches[i].rows,
            firstLine: batches[i].firstLine,
            map,
            // Only on the first request — the rest would re-send the same list
            // for no reason.
            addMasters: i === 0 ? toAdd : undefined,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `The import failed on batch ${i + 1}.`);
        const d = body.data as Report;
        total.added += d.added;
        total.skipped += d.skipped;
        total.failed += d.failed;
        total.lines += d.lines ?? 0;
        total.mastersAdded += d.mastersAdded ?? 0;
        total.results.push(...d.results);
        setProgress({ done: i + 1, total: batches.length });
      }
      setReport(total);
      setStep("done");
    } catch (e) {
      // Whatever went in stays in — the report shows it, and running the file
      // again picks up only what is missing.
      setReport(total.results.length ? total : null);
      setError(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  // ── the sample value under each mapping dropdown ────────────────────────
  const sampleOf = React.useCallback(
    (col: number | null) => {
      if (col == null || !sheet) return "";
      for (const r of sheet.rows) {
        const v = (r[col] ?? "").trim();
        if (v) return v;
      }
      return "(every cell in this column is empty)";
    },
    [sheet],
  );

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-card border border-status-red/40 bg-status-red-dim px-4 py-3 text-[13px] text-status-red">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── step 1 ─────────────────────────────────────────────────────── */}
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
                Choose the exported sheet
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

      {/* ── step 2 + 3 ─────────────────────────────────────────────────── */}
      {step === "map" && sheet ? (
        <>
          {sheets.length > 1 ? (
            <Card size="sm" className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
              <span className="text-[12px] font-semibold text-text-2">Sheet</span>
              {sheets.map((s, i) => (
                <button
                  key={s.name + i}
                  type="button"
                  onClick={() => pickSheet(i)}
                  className={cn(
                    "rounded-field border px-2.5 py-1 text-[12.5px] transition-colors",
                    i === sheetIdx
                      ? "border-primary bg-accent text-text-1"
                      : "border-border text-text-2 hover:text-text-1",
                  )}
                >
                  {s.name}{" "}
                  <span className="num text-text-3">({s.rows.length})</span>
                </button>
              ))}
            </Card>
          ) : null}

          <Card size="sm" className="flex flex-col gap-3 px-(--card-spacing)">
            <div>
              <h3 className="text-[14px] font-bold text-text-1">
                Which column is which
              </h3>
              <p className="mt-0.5 text-[12.5px] text-text-2">
                Guessed from the headings. Check the sample under each one — that is
                the first real value in that column of your sheet.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => {
                const val = map[f.id];
                return (
                  <div key={f.id} className="min-w-0">
                    <label className="flex items-baseline gap-1.5 text-[12px] font-semibold text-text-1">
                      {f.label}
                      {f.required ? (
                        <span className="text-status-red">required</span>
                      ) : null}
                    </label>
                    <select
                      className={cn(selectCls, "mt-1")}
                      value={val ?? ""}
                      onChange={(e) =>
                        setMap((m) => ({
                          ...m,
                          [f.id]: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                    >
                      <option value="">— not in this sheet —</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 truncate text-[11.5px] text-text-3">
                      {val == null ? (f.hint ?? " ") : `e.g. ${sampleOf(val)}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {missingRequired(map).length ? (
            <Card size="sm" className="flex items-start gap-2 text-[13px] text-text-2 px-(--card-spacing)">
              <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-status-amber" />
              <span>
                Still to map:{" "}
                <strong>{missingRequired(map).map((f) => f.label).join(", ")}</strong>.
                Nothing can be previewed until an order can be identified and a design
                line read.
              </span>
            </Card>
          ) : plan ? (
            <>
              <Preview plan={plan} showAll={showAllIssues} onShowAll={() => setShowAllIssues(true)} />

              {plan.unknown.length ? (
                <UnknownPanel
                  unknown={plan.unknown}
                  chosen={addNames}
                  onToggle={(k) =>
                    setAddNames((s) => {
                      const n = new Set(s);
                      if (n.has(k)) n.delete(k);
                      else n.add(k);
                      return n;
                    })
                  }
                  onAll={(on) =>
                    setAddNames(
                      on
                        ? new Set(plan.unknown.map((u) => `${u.category}::${u.value}`))
                        : new Set(),
                    )
                  }
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" onClick={() => { setStep("file"); setSheets([]); }}>
                  <IconArrowLeft className="size-3.5" /> Choose a different file
                </Button>
                <div className="flex items-center gap-3">
                  {progress ? (
                    <span className="num text-[12.5px] text-text-2">
                      batch {progress.done} of {progress.total}
                    </span>
                  ) : null}
                  <Button
                    onClick={() => void runImport()}
                    disabled={busy || plan.counts.orders === 0}
                  >
                    {busy ? <Spinner className="size-3.5" /> : <IconUpload className="size-3.5" />}
                    {busy
                      ? "Importing…"
                      : `Import ${plan.counts.orders - plan.counts.error} order${
                          plan.counts.orders - plan.counts.error === 1 ? "" : "s"
                        }`}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {/* ── step 4 ─────────────────────────────────────────────────────── */}
      {step === "done" && report ? (
        <ReportPanel
          report={report}
          onAgain={() => {
            setStep("file");
            setSheets([]);
            setReport(null);
            setShowAllIssues(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ── the preview ───────────────────────────────────────────────────────────

const ISSUE_CAP = 60;

function Preview({
  plan,
  showAll,
  onShowAll,
}: {
  plan: ImportPlan;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const issues = React.useMemo(() => {
    const all = [
      ...plan.fileIssues.map((i) => ({ ...i, orderNo: "" })),
      ...plan.orders.flatMap((o) => o.issues.map((i) => ({ ...i, orderNo: o.orderNo }))),
    ];
    const rank = { error: 0, warn: 1, note: 2 } as const;
    return all.sort((a, b) => rank[a.level] - rank[b.level] || a.line - b.line);
  }, [plan]);

  const shown = showAll ? issues : issues.slice(0, ISSUE_CAP);

  return (
    <Card size="sm" className="flex flex-col gap-3 py-4 px-(--card-spacing)">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Orders in the file" value={plan.counts.orders} />
        <Stat label="Design lines" value={plan.counts.lines} />
        <Stat
          label="Refused"
          value={plan.counts.error}
          tone={plan.counts.error ? "bad" : undefined}
        />
        <Stat
          label="Worth a look"
          value={plan.counts.warnings}
          tone={plan.counts.warnings ? "warn" : undefined}
        />
      </div>

      <p className="text-[12.5px] text-text-2">
        {plan.counts.error === 0
          ? "Every order in the file can be read."
          : `${plan.counts.error} order${plan.counts.error === 1 ? "" : "s"} will NOT be imported — the rest still will. Fix these in the sheet and run the file again; what went in the first time is skipped.`}{" "}
        An order number already in the system is skipped whatever this says.
      </p>

      {issues.length ? (
        <div className="rounded-field border border-border">
          <HScroll bodyClassName="max-h-[22rem] overflow-auto">
            <Table className="min-w-[720px]">
              <THead>
                <tr>
                  <Th className="w-[70px]">Line</Th>
                  <Th className="w-[90px]">Order</Th>
                  <Th className="w-[80px]">Level</Th>
                  <Th className="w-full">What</Th>
                </tr>
              </THead>
              <TBody>
                {shown.map((i, n) => (
                  <Tr key={n}>
                    <Td className="num text-text-2">{i.line}</Td>
                    <Td className="num text-text-2">{i.orderNo || "—"}</Td>
                    <Td>
                      <span
                        className={cn(
                          "rounded-pill px-1.5 py-0.5 text-[10.5px] font-semibold",
                          i.level === "error"
                            ? "bg-status-red-dim text-status-red"
                            : i.level === "warn"
                              ? "bg-status-amber-dim text-status-amber"
                              : "bg-chip text-text-2",
                        )}
                      >
                        {i.level === "error" ? "Refused" : i.level === "warn" ? "Check" : "Cleaned"}
                      </span>
                    </Td>
                    <Td className="whitespace-normal text-text-1">{i.message}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </HScroll>
          {!showAll && issues.length > ISSUE_CAP ? (
            <button
              type="button"
              onClick={onShowAll}
              className="w-full border-t border-border px-3 py-2 text-[12.5px] font-medium text-text-2 hover:text-text-1"
            >
              Show all {issues.length} — {issues.length - ISSUE_CAP} more
            </button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-field border border-border bg-surface-2 px-3 py-2">
      <div className="text-[11px] font-semibold tracking-[0.05em] text-text-2 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "num mt-0.5 text-[19px] leading-none font-bold",
          tone === "bad" ? "text-status-red" : tone === "warn" ? "text-status-amber" : "text-text-1",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ── names our lists have never heard of ───────────────────────────────────

const CATEGORY_LABEL: Record<UnknownName["category"], string> = {
  PARTY: "Parties",
  FABRIC: "Fabrics",
  AGENT: "Agents",
  SALES_PERSON: "Sales people",
  TRANSPORT: "Transporters",
  HASTE: "Haste",
};

function UnknownPanel({
  unknown,
  chosen,
  onToggle,
  onAll,
}: {
  unknown: UnknownName[];
  chosen: Set<string>;
  onToggle: (key: string) => void;
  onAll: (on: boolean) => void;
}) {
  const groups = React.useMemo(() => {
    const m = new Map<UnknownName["category"], UnknownName[]>();
    for (const u of unknown) {
      const list = m.get(u.category) ?? [];
      list.push(u);
      m.set(u.category, list);
    }
    return [...m.entries()];
  }, [unknown]);

  return (
    <Card size="sm" className="flex flex-col gap-3 py-4 px-(--card-spacing)">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-2xl">
          <h3 className="text-[14px] font-bold text-text-1">
            {unknown.length} name{unknown.length === 1 ? "" : "s"} the master lists do
            not have yet
          </h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-2">
            The orders import either way — the order stores the name as text. But a
            name that is not on the list cannot be picked from a dropdown or a filter
            afterwards, so an imported order could not be found by choosing its own
            party. Untick anything that looks like a typo of a name you already have;
            you can always add it later in Masters.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onAll(true)} className="text-[12px] font-medium text-text-2 underline underline-offset-2 hover:text-text-1">All</button>
          <button type="button" onClick={() => onAll(false)} className="text-[12px] font-medium text-text-2 underline underline-offset-2 hover:text-text-1">None</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map(([cat, list]) => (
          <div key={cat} className="rounded-field border border-border">
            <div className="border-b border-border px-3 py-1.5 text-[11px] font-semibold tracking-[0.05em] text-text-2 uppercase">
              {CATEGORY_LABEL[cat]} · {list.length}
            </div>
            <ul className="max-h-56 overflow-auto">
              {list.map((u) => {
                const key = `${u.category}::${u.value}`;
                const on = chosen.has(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => onToggle(key)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                        )}
                      >
                        {on ? <IconCheck className="size-3" stroke={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-1">
                        {u.value}
                      </span>
                      {u.nearest ? (
                        <span className="shrink-0 text-[11px] text-status-amber" title={`Already on the list: ${u.nearest}`}>
                          near “{u.nearest}”
                        </span>
                      ) : null}
                      <span className="num shrink-0 text-[11px] text-text-3">{u.uses}x</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── what happened ─────────────────────────────────────────────────────────

function ReportPanel({ report, onAgain }: { report: Report; onAgain: () => void }) {
  const problems = report.results.filter((r) => r.status === "error");
  // ── A SKIPPED ORDER HAS TO BE NAMEABLE ────────────────────────────────
  //
  // "Already there: 40" is a number somebody can do nothing with. A skipped
  // order is one that did NOT come across — not overwritten, but not imported
  // either — so the only useful next step is to go and look at those forty in
  // the old sheet, and that needs their numbers. They are listed as plain
  // comma-separated text rather than a table row each: on a real file this can
  // be two hundred of them, all with the identical reason.
  const skipped = report.results
    .filter((r) => r.status === "skipped")
    .map((r) => r.orderNo);
  return (
    <>
      <Card size="sm" className="flex flex-col gap-3 py-4 px-(--card-spacing)">
        <div className="flex items-center gap-2">
          <IconCircleCheck
            className={cn("size-5", report.failed ? "text-status-amber" : "text-status-green")}
          />
          <h3 className="text-[15px] font-bold text-text-1">
            {report.added} order{report.added === 1 ? "" : "s"} imported
            {report.lines ? `, ${report.lines} design line${report.lines === 1 ? "" : "s"}` : ""}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Added" value={report.added} />
          <Stat label="Already there" value={report.skipped} />
          <Stat label="Refused" value={report.failed} tone={report.failed ? "bad" : undefined} />
          <Stat label="Names added" value={report.mastersAdded} />
        </div>
        <p className="text-[12.5px] text-text-2">
          {report.skipped
            ? `${report.skipped} order${report.skipped === 1 ? " was" : "s were"} already in the system and ${report.skipped === 1 ? "was" : "were"} left exactly as ${report.skipped === 1 ? "it is" : "they are"}, so ${report.skipped === 1 ? "it is" : "they are"} NOT in from this file. `
            : ""}
          {report.failed
            ? "Fix the refused rows in the sheet and run the same file again — everything already in is skipped."
            : "Nothing else to do."}
        </p>

        {skipped.length ? (
          <div className="flex flex-col gap-1 rounded-field bg-chip px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-text-2">
              Order numbers already in the system
            </div>
            <p className="num select-all text-[12.5px] leading-relaxed text-text-1">
              {skipped.join(", ")}
            </p>
            <p className="text-[11.5px] text-text-3">
              These came from the file but were not imported, because an order
              with each of these numbers is already here. Check them in the old
              sheet before you decide what to do.
            </p>
          </div>
        ) : null}
        <div>
          <Button variant="outline" onClick={onAgain}>
            <IconUpload className="size-3.5" /> Import another file
          </Button>
        </div>
      </Card>

      {problems.length ? (
        <Card size="sm" className="py-0">
          <HScroll bodyClassName="max-h-80 overflow-auto">
            <Table className="min-w-[560px]">
              <THead>
                <tr>
                  <Th className="w-[110px]">Order no</Th>
                  <Th className="w-full">Why it did not go in</Th>
                </tr>
              </THead>
              <TBody>
                {problems.map((r, i) => (
                  <Tr key={i}>
                    <Td className="num text-text-1">{r.orderNo}</Td>
                    <Td className="whitespace-normal text-text-2">{r.reason}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </HScroll>
        </Card>
      ) : null}
    </>
  );
}
