// StageCell — docs/SCREENS.md §4B.4
//
// How far a set of designs has got through ONE stage. A quality row passes all
// its designs; a colour row passes just itself.
//
// The seven column definitions are DERIVED from STAGE_OPTIONS in
// lib/order-entry/order-status.ts rather than retyped, so the tracker's column
// order can never drift from the board's or from workflow_stages. Only the
// abbreviations are local — one column per stage leaves no room for
// "Rolling & checking", and the full name is on `title` and in the panel.
//
// Note on the data: the `StageCell` TYPE (lib/order-entry/order-status.ts)
// carries `plannedAt` and `delayMinutes` on every cell, not just on the
// single-line detail endpoint. That is what lets tracker-detail.tsx show a due
// date and a lateness without a second fetch — see §4B.6.

import { IconCheck } from "@tabler/icons-react";

import { STAGE_OPTIONS } from "@/lib/order-entry/order-status";
import type { OrderStatusRow, StageCell as StageCellData } from "@/lib/order-entry/order-status";
import { formatDate } from "@/lib/order-entry/orders";
import {
  STAGE_CELL_TONE,
  STAGE_CHIP_TONE,
  STAGE_DOT,
  type StageCellTone,
  type StageChipTone,
} from "./status-style";
import { cn } from "@/lib/utils";

/** Column-header abbreviations, keyed by stage. Falls back to the full label. */
const SHORT: Record<string, string> = {
  order_entry: "Entry",
  stock_checking: "Stock",
  rolling_checking: "Rolling",
  challan: "Challan",
  bill: "Bill",
  dispatch: "Dispatch",
  received_lr: "LR",
};

export const STAGE_COLUMNS: { key: string; short: string; full: string }[] =
  STAGE_OPTIONS.map((s) => ({
    key: s.key,
    short: SHORT[s.key] ?? s.label,
    full: s.label,
  }));

export const STAGE_COL_WIDTH = 96;

export function StageCell({
  lines,
  stageKey,
  label,
}: {
  lines: OrderStatusRow[];
  stageKey: string;
  label: string;
}) {
  const cells = lines.map((l) => l.stages.find((s) => s.stageKey === stageKey));
  const n = lines.length;
  const done = cells.filter((c) => c?.state === "done").length;
  const overdue = cells.some((c) => c?.state === "overdue");
  const all = n > 0 && done === n;
  const some = done > 0 && !all;

  const tone: StageCellTone = all
    ? "all"
    : some
      ? "some"
      : overdue
        ? "overdue"
        : "none";

  // A single design is a yes/no; a group needs the count.
  const text =
    n === 1 ? (all ? "✓" : overdue ? "!" : "–") : all ? "✓" : `${done}/${n}`;

  return (
    <span
      title={
        n === 1
          ? `${label}: ${all ? "done" : overdue ? "overdue" : "not done"}`
          : `${label}: ${done} of ${n} designs done`
      }
      className={cn(
        // `.num` (not font-mono) per §0.3 — tabular figures in the UI sans, so
        // "3/8" and "10/12" line up down the column without reading as code.
        "num inline-flex min-w-[44px] items-center justify-center rounded-pill px-2 py-1 text-[12px] font-semibold",
        STAGE_CELL_TONE[tone],
      )}
    >
      {text}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// The Board's stage renderers — docs/SCREENS.md §4A.6
//
// A different question again from <StageCell> above. That one answers "how
// far has this SET of designs got through one stage?" for the tracker's
// quality rows. These answer "what does this ONE stage cell say?" for the
// board's seven compact columns, where the column header already names the
// stage, so the cell carries only the status and the detail lives on `title`.
// They live here rather than in the board so every stage-shaped renderer in
// the module is in one file.
// ───────────────────────────────────────────────────────────────────────────

/** The little pill used by each per-stage status cell. */
export function StageDot({
  tone,
  title,
  children,
}: {
  tone: StageChipTone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        // `.num` (not font-mono) per §0.3 — "3/8" and "12d" line up down the
        // column without reading as code.
        "num inline-flex min-w-[26px] items-center justify-center rounded-md px-1 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STAGE_CHIP_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * One stage's status for one row. On a parent (order) row the cell has
 * already been folded over the order's lines by `aggregateOrderGroups`
 * (`doneOf` / `outOf` / `totalLines`); on a child row it is that one line.
 *
 * **Stock checking is special-cased FIRST and its gate always wins** — done →
 * a green check, mixed → inline counts, anything out of stock → a red `Out`,
 * otherwise a muted pending dash. Falling through to the generic branches
 * below would let a stock cell read a date where it should read *Out of
 * stock*, which is exactly the disagreement between this cell, the drawer and
 * the CSV that the gate exists to prevent.
 */
export function StageChip({ cell }: { cell: StageCellData }) {
  const tip = cell.date ? ` · ${formatDate(cell.date)}` : "";
  const total = cell.totalLines ?? 0;

  if (cell.stageKey === "stock_checking") {
    if (cell.state === "done")
      return (
        <StageDot tone="success" title={`In stock${tip}`}>
          <IconCheck className="size-3" />
        </StageDot>
      );
    const outOf = cell.outOf ?? 0;
    const inOf = cell.doneOf ?? 0;
    const pendOf = Math.max(0, total - inOf - outOf);
    // Mixed order: compact colour-coded counts (green in · red out · grey
    // pending), with the whole sentence on `title`.
    if (total > 1 && inOf > 0 && (outOf > 0 || pendOf > 0))
      return (
        <span
          title={`${inOf} in stock · ${outOf} out of stock · ${pendOf} pending`}
          className="num inline-flex items-center gap-1 text-[11px] font-medium"
        >
          {inOf ? <span className="text-status-green">{inOf}✓</span> : null}
          {outOf ? <span className="text-status-red">{outOf}✕</span> : null}
          {pendOf ? <span className="text-text-3">{pendOf}·</span> : null}
        </span>
      );
    if (outOf > 0 || cell.stockStatus === "out_of_stock")
      return (
        <StageDot tone="danger" title="Out of stock">
          Out
        </StageDot>
      );
    return (
      <StageDot tone="muted" title="Pending">
        –
      </StageDot>
    );
  }

  if (cell.state === "done")
    return (
      <StageDot tone="success" title={`Done${tip}`}>
        <IconCheck className="size-3" />
      </StageDot>
    );
  if (cell.state === "overdue")
    return (
      <StageDot tone="danger" title="Overdue">
        {cell.daysOverdue > 0 ? `${cell.daysOverdue}d` : "!"}
      </StageDot>
    );
  if (cell.state === "in_progress") {
    if (total > 1 && cell.doneOf)
      return (
        <StageDot tone="warning" title={`${cell.doneOf} of ${total} done`}>
          {cell.doneOf}/{total}
        </StageDot>
      );
    return (
      <StageDot tone="warning" title="In progress">
        •
      </StageDot>
    );
  }
  return (
    <span className="text-text-3" title="Not started">
      –
    </span>
  );
}

/**
 * The order's current (bottleneck) stage as a compact badge — the mobile
 * card's answer to "what is this order waiting on?" (§4A.6). A stage-colour
 * dot + the stage name in a pill, tinted by urgency, with a muted sub-line
 * for the detail (`3 of 8 lines`, `2d late`, `4 of 9 in stock`).
 *
 * The stock gate is checked BEFORE the overdue branch for the same reason as
 * in StageChip: a stock cell must never read a date where it should read
 * *Out of stock*. No `currentStageKey` at all means every stage is done ⇒ a
 * green **Completed** pill.
 */
export function CurrentStageBadge({
  stages,
  currentStageKey,
  aggregate,
}: {
  stages: StageCellData[];
  currentStageKey: string | null;
  /** True on an order row, where the counts fold that order's lines. */
  aggregate?: boolean;
}) {
  if (!currentStageKey) {
    return (
      <span className="inline-flex rounded-pill bg-status-green-dim px-2 py-0.5 text-[11px] font-medium text-status-green">
        Completed
      </span>
    );
  }
  const cur = stages.find((s) => s.stageKey === currentStageKey);
  if (!cur) return <span className="text-text-3">—</span>;
  const label =
    STAGE_OPTIONS.find((o) => o.key === cur.stageKey)?.label ?? cur.label;

  let tone = STAGE_CHIP_TONE.warning;
  let sub: string | null = null;
  if (cur.stageKey === "stock_checking") {
    if (cur.stockStatus === "out_of_stock") {
      tone = STAGE_CHIP_TONE.danger;
      sub =
        aggregate && cur.outOf
          ? `${cur.outOf} of ${cur.totalLines} out of stock`
          : "Out of stock";
    } else {
      tone = STAGE_CHIP_TONE.muted;
      sub =
        aggregate && cur.doneOf
          ? `${cur.doneOf} of ${cur.totalLines} in stock`
          : "Pending";
    }
  } else if (cur.state === "overdue") {
    tone = STAGE_CHIP_TONE.danger;
    sub = cur.daysOverdue > 0 ? `${cur.daysOverdue}d late` : "Overdue";
  } else if (
    aggregate &&
    cur.doneOf != null &&
    cur.totalLines &&
    cur.doneOf > 0 &&
    cur.doneOf < cur.totalLines
  ) {
    sub = `${cur.doneOf} of ${cur.totalLines} lines`;
  }

  return (
    <div className="min-w-0">
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-medium",
          tone,
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            STAGE_DOT[cur.stageKey] ?? "bg-text-3",
          )}
        />
        <span className="truncate">{label}</span>
      </span>
      {sub ? (
        <div className="mt-0.5 truncate text-[11px] text-text-3">{sub}</div>
      ) : null}
    </div>
  );
}
