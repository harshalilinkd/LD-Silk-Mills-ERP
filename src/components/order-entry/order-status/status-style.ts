// Shared tone/label maps for the order-status board + detail panel, restyled
// against this shell's own design tokens (docs/DESIGN.md) — bg-status-*-dim +
// text-status-* pairs, same idiom as components/order-entry/crm/pill.tsx.
import type { OverallStatus, StageState } from "@/lib/order-entry/order-status";

export const OVERALL_TONE: Record<OverallStatus, string> = {
  completed: "bg-status-green-dim text-status-green",
  in_progress: "bg-status-blue-dim text-status-blue",
  overdue: "bg-status-red-dim text-status-red",
};

export const OVERALL_LABEL: Record<OverallStatus, string> = {
  completed: "Completed",
  in_progress: "In progress",
  overdue: "Overdue",
};

export const STAGE_STATE_TONE: Record<StageState, string> = {
  done: "bg-status-green-dim text-status-green",
  in_progress: "bg-status-blue-dim text-status-blue",
  overdue: "bg-status-red-dim text-status-red",
  not_started: "bg-chip text-text-3",
};

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  done: "Done",
  in_progress: "In progress",
  overdue: "Overdue",
  not_started: "Not started",
};

// The stage that determines "dispatched" for the whole-order rollup and the
// sibling colour chips (see quality-groups.ts and tracker-detail.tsx).
export const DISPATCH_STAGE_KEY = "dispatch";

// ── StageCell (docs/SCREENS.md §4B.4) ──────────────────────────────────────
// A different question from STAGE_STATE_TONE above. That one tones ONE line's
// state; this one tones how far a SET of designs has got through one stage,
// so it has an "amber = some of them" step that a single line cannot be in.
// Kept here rather than in stage-cell.tsx so every tone map in this module
// lives in one file and stays on the same bg-status-*-dim / text-status-*
// idiom.
export type StageCellTone = "all" | "some" | "overdue" | "none";

export const STAGE_CELL_TONE: Record<StageCellTone, string> = {
  all: "bg-status-green-dim text-status-green",
  some: "bg-status-amber-dim text-status-amber",
  overdue: "bg-status-red-dim text-status-red",
  none: "bg-chip text-text-3",
};

// ── StageChip / StageDot (docs/SCREENS.md §4A.6) ───────────────────────────
// The Board's seven per-stage columns carry a THIRD tone vocabulary, keyed by
// what the chip is saying rather than by a state enum: green = done / in
// stock, red = overdue / out of stock, amber = partly done, muted = nothing
// yet. It is deliberately separate from STAGE_CELL_TONE above — that one has
// no "danger" step for stock, and this one has no "some" that means anything
// other than amber.
export type StageChipTone = "success" | "danger" | "warning" | "muted";

export const STAGE_CHIP_TONE: Record<StageChipTone, string> = {
  success: "bg-status-green-dim text-status-green",
  danger: "bg-status-red-dim text-status-red",
  warning: "bg-status-amber-dim text-status-amber",
  muted: "bg-chip text-text-3",
};

// ── STAGE_DOT (docs/SCREENS.md §4A.6) ──────────────────────────────────────
// An IDENTITY colour per stage — the `size-1.5` dot in each stage column
// header and in CurrentStageBadge. It says *which* stage, never how it is
// going (that is STAGE_CHIP_TONE's job), so a red dot on Challan is not an
// alarm.
//
// The source app used raw Tailwind palette steps (indigo/blue/amber/rose/
// emerald/violet/cyan). docs/DESIGN.md forbids a colour that is not a token,
// so these are the seven most-separated hues our palette actually has. The
// last two are both teal-family because that is where the palette runs out —
// `accent-text` is the deep teal (light) / pale teal (dark) variant, so it
// still reads apart from `primary` in both themes.
export const STAGE_DOT: Record<string, string> = {
  order_entry: "bg-status-blue",
  stock_checking: "bg-primary",
  rolling_checking: "bg-status-amber",
  challan: "bg-status-red",
  bill: "bg-status-green",
  dispatch: "bg-status-purple",
  received_lr: "bg-accent-text",
};
