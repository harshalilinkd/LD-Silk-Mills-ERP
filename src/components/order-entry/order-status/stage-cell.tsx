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

import { STAGE_OPTIONS } from "@/lib/order-entry/order-status";
import type { OrderStatusRow } from "@/lib/order-entry/order-status";
import { STAGE_CELL_TONE, type StageCellTone } from "./status-style";
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
