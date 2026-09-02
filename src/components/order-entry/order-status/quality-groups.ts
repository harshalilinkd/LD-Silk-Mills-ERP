// quality-groups — docs/SCREENS.md §4B.1
//
// Roll an order's design lines up by QUALITY (fabric).
//
// The board lists one row per ORDER and the old tracker listed one row per
// DESIGN, so an order of 97 lines was 97 rows and the operator had to read
// every one to answer "how far along is BROKERED C2?". Qualities are the unit
// people actually think in; the designs under one are its colours/matchings.
//
// > This app has no colour field. What operators call a colour is `design_no`
// > — the DSGN-MATCHING column from the old AppSheet, e.g. `21288-A` under
// > `INDIANA CHECKS`.
//
// Pure data + class maps: no JSX, no hooks, so it is importable from a server
// component too if a later phase needs the rollup on the server.

import type {
  OrderStatusGroup,
  OrderStatusRow,
} from "@/lib/order-entry/order-status";
import { DISPATCH_STAGE_KEY } from "./status-style";

/**
 * A design line is "dispatched" when its dispatch stage is done. That is the
 * question the operator is really asking of each colour.
 */
export function isDispatched(line: OrderStatusRow): boolean {
  return line.stages.some(
    (s) => s.stageKey === DISPATCH_STAGE_KEY && s.state === "done",
  );
}

/**
 * Progress of a row, straight off the existing Operations data — no new state
 * is stored anywhere. Priority is fixed: everything finished wins, then
 * anything started, then nothing started.
 */
export type RowTone = "done" | "progress" | "none" | "cancelled";

export function toneOfLines(lines: OrderStatusRow[]): RowTone {
  const active = lines.filter((l) => !l.isCancelled);
  // A row whose every design is cancelled is not "not started" — it is out of
  // play, and colouring it red would read as urgent work that does not exist.
  if (active.length === 0) return "cancelled";
  if (active.every((l) => l.doneCount >= l.stages.length)) return "done";
  if (active.some((l) => l.doneCount > 0)) return "progress";
  return "none";
}

// ── Status is carried by the TEXT colour, never a row background ───────────
// Tinting whole rows was tried and reverted: most work on this screen is
// unfinished, so the table became a wall of red with the data buried under
// it. The row background only ever says "hovered" / "selected" / "flashed".
//
// Spec tokens → ours (docs/DESIGN.md): success → status-green, warning →
// status-amber, danger → status-red, ink-muted → text-3.
export const TONE_TEXT: Record<RowTone, string> = {
  done: "text-status-green",
  progress: "text-status-amber",
  none: "text-status-red",
  cancelled: "text-text-3",
};

export const TONE_LABEL: Record<RowTone, string> = {
  done: "Completed",
  progress: "In progress",
  none: "Not started",
  cancelled: "Cancelled",
};

/** The same four tones as a filled pill, for the detail panel's header. */
export const TONE_PILL: Record<RowTone, string> = {
  done: "bg-status-green-dim text-status-green ring-status-green/30",
  progress: "bg-status-amber-dim text-status-amber ring-status-amber/30",
  none: "bg-status-red-dim text-status-red ring-status-red/30",
  cancelled: "bg-chip text-text-3 ring-border",
};

export type QualityGroup = {
  /** `${orderId}|${fabric}` — also the row's `data-group-key`. */
  key: string;
  orderId: string;
  orderNo: string;
  party: string;
  salesPerson: string | null;
  odDate: string;
  haste: string | null;
  challanNo: string | null;
  lotNo: string | null;
  fabric: string;
  /** The colours/matchings under this quality, in entry order. */
  lines: OrderStatusRow[];
  qtyTotal: number;
  valueTotal: number;
  dispatched: number;
  pending: number;
  cancelled: number;
  /** Every design under this quality is cancelled. */
  allCancelled: boolean;
  /** Red / amber / green, from the stages already recorded against it. */
  tone: RowTone;
};

/**
 * Group by (order, fabric), keeping the order the server already sorted lines
 * into — newest order first, then the user's entry order within an order.
 */
export function toQualityGroups(orders: OrderStatusGroup[]): QualityGroup[] {
  const out: QualityGroup[] = [];
  const byKey = new Map<string, QualityGroup>();

  for (const o of orders) {
    for (const line of o.lines) {
      const key = `${o.orderId}|${line.fabric}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          orderId: o.orderId,
          orderNo: o.orderNo,
          party: o.party,
          salesPerson: o.salesPerson,
          odDate: o.odDate,
          haste: o.haste,
          challanNo: o.challanNo,
          lotNo: o.lotNo,
          fabric: line.fabric,
          lines: [],
          qtyTotal: 0,
          valueTotal: 0,
          dispatched: 0,
          pending: 0,
          cancelled: 0,
          allCancelled: false,
          tone: "none",
        };
        byKey.set(key, g);
        out.push(g);
      }
      g.lines.push(line);
      g.qtyTotal += Number(line.qtyMtr ?? 0);
      g.valueTotal += Number(line.lineTotal ?? 0);
      if (line.isCancelled) g.cancelled += 1;
      else if (isDispatched(line)) g.dispatched += 1;
      else g.pending += 1;
    }
  }

  for (const g of out) {
    g.allCancelled = g.cancelled === g.lines.length;
    g.tone = toneOfLines(g.lines);
  }
  return out;
}

/**
 * Every design line across the groups, in the order they appear on screen —
 * this is what the detail panel's ← / → walk through.
 */
export function flattenLines(groups: QualityGroup[]): OrderStatusRow[] {
  return groups.flatMap((g) => g.lines);
}
