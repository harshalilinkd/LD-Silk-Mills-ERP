// The stage vocabulary and pure status logic from `workflow.ts`, split out so
// a CLIENT component can import a stage label without pulling in `postgres`
// (`applyStageProgress` there touches the database and drags `net`/`tls` into
// any bundle that imports anything else from that file — Webpack can't tell
// a constant from a DB call inside the same module). `workflow.ts` re-exports
// everything here, so every existing server-side importer is unaffected.

export const STAGE_KEYS = [
  "order_entry",
  "stock_checking",
  "rolling_checking",
  "challan",
  "bill",
  "dispatch",
  "received_lr",
  "on_hold",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

// ═══════════════════════════════════════════════════════════════════════════
//  `on_hold` IS AN ASIDE, NOT A STEP. NOTHING MAY COUNT IT AS ONE.
// ═══════════════════════════════════════════════════════════════════════════
//
// The old Google Sheet tracks a hold beside the seven stages, and the owner
// asked for it (Sep 2026) so that column stops being dropped on import. It is
// a real stage row — it can be ticked, it carries a date, it shows on the
// board — but it is NOT part of the sequence, and the difference is not
// cosmetic:
//
//   "Completed" in this system means EVERY stage row on the line is done. Add
//   an eighth stage that is almost never ticked and 2,047 completed lines and
//   72 completed orders stop being complete — measured on the live table
//   before this was written. Every dashboard figure, the Order status board
//   and two reports would have moved on the same day, for a column about
//   something that did not happen.
//
// So every computation that asks "is this line finished", "which stage is it
// on" or "how far has it reached" filters this key out, in SQL as well as
// here. `FLOW_STAGE_SQL` below is that filter, written once.
//
// It is also never BACKFILLED by the status importer: ticking everything up to
// the furthest tick is right for a sequence and would otherwise invent a hold
// that never happened.
//
// ── sort_order 0, and that is load-bearing ──────────────────────────────
//
// `dashboard-brain.ts` decides a line is delivered by looking for the stage
// with `sort_order = (select max(sort_order) from workflow_stages)`. Given
// this stage the highest sort order, "delivered" would silently come to mean
// "put on hold". At 0 it sorts before `order_entry`, so `max()` is still
// Received LR and that query needed no change at all. Anything that takes a
// `max(sort_order) filter (is_done)` as "how far it reached" also reads 0,
// which is the same answer as nothing ticked.
export const ASIDE_STAGE_KEYS = ["on_hold"] as const;
const ASIDE = new Set<string>(ASIDE_STAGE_KEYS);

/** The seven stages that ARE the sequence, in order. */
export const FLOW_STAGE_KEYS = STAGE_KEYS.filter((k) => !ASIDE.has(k));

/** The stage whose tick means the work has left the mill. */
export const LAST_FLOW_STAGE_KEY = FLOW_STAGE_KEYS[FLOW_STAGE_KEYS.length - 1];

export function isAsideStage(stageKey: string): boolean {
  return ASIDE.has(stageKey);
}

/**
 * The same filter for raw SQL. Use it on any query that joins
 * `line_stage_progress` or `workflow_stages` to ask how far a line has got.
 */
export const FLOW_STAGE_SQL = `stage_key <> 'on_hold'`;

export type StockStatus = "in_stock" | "out_of_stock";

export class WorkflowError extends Error {}

export const STAGE_LABELS: Record<StageKey, string> = {
  on_hold: "On hold",
  order_entry: "Order entry",
  stock_checking: "Stock checking",
  rolling_checking: "Rolling & checking",
  challan: "Challan",
  bill: "Bill",
  dispatch: "Dispatch",
  received_lr: "Received LR",
};

export type OperationsStatus =
  | "COMPLETED"
  | "PARTIALLY COMPLETED"
  | "PENDING"
  | "CANCELLED";

export function plannedAtForOffset(orderDate: string, offsetDays: number): Date {
  const d = new Date(`${orderDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export function buildInitialStageRows(
  orderLineItemId: string,
  orderDate: string,
  offsets: Record<string, number>,
) {
  // All EIGHT, the hold included: a stage with no row cannot be ticked, and the
  // board renders what rows exist rather than what the code hopes for.
  return STAGE_KEYS.map((stageKey) => ({
    orderLineItemId,
    stageKey,
    plannedAt: plannedAtForOffset(orderDate, offsets[stageKey] ?? 1),
    actualAt: null,
    isDone: false,
    delayMinutes: null,
  }));
}

export const PROGRESS_STAGE_KEYS_LIST = [
  "rolling_checking",
  "challan",
  "bill",
  "dispatch",
  "received_lr",
] as const;
const PROGRESS_STAGE_KEYS = new Set<string>(PROGRESS_STAGE_KEYS_LIST);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FINISHED MEANS THE LAST STAGE IS TICKED, AND NOT ON HOLD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This used to be "every stage row is done", and that disagreed with the rest
 * of the ERP. 33 live lines have Received LR ticked with an earlier stage never
 * ticked — a missed tick behind work that has plainly left the mill. Counting
 * ticks called those 33 unfinished while the reports, the production dashboard
 * and the home page all called them finished, so the same book was 2,047
 * complete on one screen and 2,080 on another.
 *
 * The owner settled it (Sep 2026): ticking every stage is NOT required, and the
 * one thing that takes a line back out of "completed" is a HOLD. So the rule is
 * the reports' rule, plus the hold — and every screen now agrees.
 *
 * `Stages done` beside the status is where a missed tick still shows.
 */
export function computeLineStatus(
  stages: { stageKey: string; isDone: boolean }[],
): OperationsStatus {
  const flow = stages.filter((s) => !ASIDE.has(s.stageKey));
  if (flow.length === 0) return "PENDING";
  const lastKey = FLOW_STAGE_KEYS[FLOW_STAGE_KEYS.length - 1];
  const finished = flow.some((s) => s.stageKey === lastKey && s.isDone);
  const held = stages.some((s) => ASIDE.has(s.stageKey) && s.isDone);
  if (finished && !held) return "COMPLETED";
  const started = flow.some(
    (s) => s.isDone && PROGRESS_STAGE_KEYS.has(s.stageKey),
  );
  return started ? "PARTIALLY COMPLETED" : "PENDING";
}

/**
 * The same judgement from what a database already worked out.
 *
 * `stageRows` is only used to tell "no stage rows at all" from "nothing ticked
 * yet"; `doneRows` is carried for callers that still want it. What decides
 * COMPLETED is `lastStageDone` and `onHold`.
 */
export function lineStatusFromCounts(counts: {
  stageRows: number;
  doneRows: number;
  anyProgressStageDone: boolean;
  lastStageDone: boolean;
  onHold: boolean;
}): OperationsStatus {
  if (counts.stageRows === 0) return "PENDING";
  if (counts.lastStageDone && !counts.onHold) return "COMPLETED";
  return counts.anyProgressStageDone ? "PARTIALLY COMPLETED" : "PENDING";
}

export function computeOrderStatus(
  lineStatuses: OperationsStatus[],
): OperationsStatus {
  if (lineStatuses.length === 0) return "PENDING";
  if (lineStatuses.every((s) => s === "COMPLETED")) return "COMPLETED";
  if (lineStatuses.every((s) => s === "PENDING")) return "PENDING";
  return "PARTIALLY COMPLETED";
}

export function isOrderCancelled(total: number, cancelled: number): boolean {
  return total > 0 && cancelled === total;
}

export function isOrderDeleted(total: number, deleted: number): boolean {
  return total > 0 && deleted === total;
}

export function lineMatchKey(parts: {
  quality: string;
  designNo: string;
  qtyMtr: string | number;
}): string {
  return [
    parts.quality.trim().toLowerCase(),
    parts.designNo.trim().toLowerCase(),
    Number(parts.qtyMtr),
  ].join("|");
}

export function computeDelayMinutes(planned: Date | null, actual: Date): number {
  if (!planned) return 0;
  return Math.round((actual.getTime() - planned.getTime()) / 60000);
}

/** Index of each stage in `STAGE_KEYS`, for `applyStageProgress`'s ordering checks. */
export const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGE_KEYS.map((k, i) => [k, i]),
);
