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
// sibling colour chips (see status-panel.tsx and quality-groups.ts).
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
