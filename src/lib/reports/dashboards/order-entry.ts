import "server-only";

import { orderRegister } from "../order-entry/order-register";
import { productionStatus } from "../order-entry/production-status";
import { qualityAnalysis } from "../order-entry/quality-analysis";
import { inrShort } from "../format";
import { STAGES } from "../order-entry/shared";
import type { ReportAnalysis, ReportParams, ReportRow } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The screen dashboards, built from the reports themselves
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS FILE RUNS THE REPORTS RATHER THAN WRITING ITS OWN SQL ───────
 *
 * The owner's standing requirement is that every figure be right, and the
 * fastest way to break that is to compute the same number twice. A dashboard
 * with its own `sum(line_total)` looks identical to the report's until one of
 * them forgets to exclude cancelled lines, and then two screens in the same
 * ERP disagree by lakhs with nothing on either to say which is wrong.
 *
 * So nothing here queries the database. Each dashboard runs the REPORT — the
 * same `run()` the CSV and the workbook use, whose rows were checked against
 * independently-written SQL — and reduces its verified rows into the shapes a
 * chart needs. A figure on the screen and the same figure in the downloaded
 * file are then the same arithmetic by construction, not by agreement.
 *
 * It also means the analysis object the Excel dashboard draws (KPIs, trend,
 * ranked panels, the month grid, the written insights and the caveats) is
 * available to the screen unchanged. The web dashboard and the workbook
 * dashboard are the same dashboard rendered twice.
 *
 * ── COST ─────────────────────────────────────────────────────────────────
 *
 * Sales runs two reports, Production runs one. They are awaited IN TURN: the
 * pool is five connections wide and pipelined statements stall under the
 * transaction pooler, the same rule every other screen in this ERP follows.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));

export type Slice = { label: string; value: number; meta?: string };

/** Order-value bands, smallest first. The last one catches everything above. */
const SIZE_BANDS = [
  { label: "Under ₹50,000", under: 50_000 },
  { label: "₹50,000 – ₹2 lakh", under: 200_000 },
  { label: "₹2 – 5 lakh", under: 500_000 },
  { label: "₹5 – 10 lakh", under: 1_000_000 },
  { label: "Over ₹10 lakh", under: Number.POSITIVE_INFINITY },
];
export type MonthPoint = { month: string; value: number; orders: number; metres: number };

/** Sorted biggest first, then by name, so the same data always draws the same. */
function rank(m: Map<string, number>, limit?: number): Slice[] {
  const all = [...m]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (!limit || all.length <= limit) return all;
  const head = all.slice(0, limit);
  const rest = all.slice(limit).reduce((t, x) => t + x.value, 0);
  // Never drop the tail silently — a pie that does not add up to the total is
  // a pie somebody reconciles against the report and comes up short on.
  return rest > 0 ? [...head, { label: "Others", value: rest }] : head;
}

function add(m: Map<string, number>, k: string, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

// ─── Sales ─────────────────────────────────────────────────────────────────

export type SalesDashboard = {
  analysis: ReportAnalysis;
  orders: number;
  months: MonthPoint[];
  byStage: Slice[];
  byAgent: Slice[];
  bySalesPerson: Slice[];
  byTransport: Slice[];
  bySize: Slice[];
  topCustomers: Slice[];
  topQualities: Slice[];
  completion: { complete: number; open: number };
};

export async function salesDashboard(params: ReportParams): Promise<SalesDashboard> {
  const reg = await orderRegister.run(params);
  const qual = await qualityAnalysis.run(params);

  const months = new Map<string, MonthPoint>();
  const byStage = new Map<string, number>();
  const byAgent = new Map<string, number>();
  const bySales = new Map<string, number>();
  const byTransport = new Map<string, number>();
  const byParty = new Map<string, number>();
  const partyOrders = new Map<string, number>();

  for (const r of reg.rows) {
    const key = s(r.order_date).slice(0, 7);
    if (key) {
      const p = months.get(key) ?? { month: key, value: 0, orders: 0, metres: 0 };
      p.value += n(r.value);
      p.orders += 1;
      p.metres += n(r.qty_mtr);
      months.set(key, p);
    }
    // Orders, not value — this is the "where is everything" donut, and one
    // ₹40 L order would otherwise make a stage look busy on its own.
    add(byStage, s(r.stage) || "Not started", 1);
    add(byAgent, s(r.agent).trim() || "No agent", n(r.value));
    add(bySales, s(r.sales_person).trim() || "Not recorded", n(r.value));
    add(byTransport, s(r.transport).trim() || "Not recorded", n(r.value));
    const party = s(r.party_name).trim() || "Not recorded";
    add(byParty, party, n(r.value));
    add(partyOrders, party, 1);
  }

  // How the order book is shaped: how many orders fall in each size band, and
  // what each band is worth. Five orders of a crore and five hundred of ten
  // thousand are the same total and a completely different business.
  const sizeCount = new Map<string, number>();
  const sizeValue = new Map<string, number>();
  for (const r of reg.rows) {
    const band = SIZE_BANDS.find((b) => n(r.value) < b.under) ?? SIZE_BANDS[SIZE_BANDS.length - 1];
    add(sizeCount, band.label, 1);
    add(sizeValue, band.label, n(r.value));
  }

  const byQuality = new Map<string, number>();
  const qualityLines = new Map<string, number>();
  for (const r of qual.rows) {
    const q = s(r.quality).trim() || "Not recorded";
    add(byQuality, q, n(r.value));
    add(qualityLines, q, n(r.lines));
  }

  const topCustomers = rank(byParty, 10)
    .filter((x) => x.label !== "Others")
    .map((x) => ({ ...x, meta: `${partyOrders.get(x.label) ?? 0} orders` }));

  return {
    analysis: reg.analysis,
    orders: reg.rows.length,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byStage: rank(byStage),
    byAgent: rank(byAgent, 7),
    bySalesPerson: rank(bySales, 7),
    byTransport: rank(byTransport, 7),
    bySize: SIZE_BANDS.map((b) => ({
      label: b.label,
      value: sizeCount.get(b.label) ?? 0,
      meta: `${inrShort(sizeValue.get(b.label) ?? 0)} in all`,
    })).filter((b) => b.value > 0),
    topCustomers,
    topQualities: rank(byQuality, 10)
      .filter((x) => x.label !== "Others")
      .map((x) => ({ ...x, meta: `${qualityLines.get(x.label) ?? 0} lines` })),
    completion: {
      complete: reg.rows.filter((r) => r.is_complete === true).length,
      open: reg.rows.filter((r) => r.is_complete !== true).length,
    },
  };
}

// ─── Production ────────────────────────────────────────────────────────────

export type StageRow = {
  no: number;
  label: string;
  done: number;
  pct: number;
  /** Average days past the planned date, over the lines that HAVE been ticked. */
  avgLate: number | null;
  /** How many fell away between the stage above and this one. */
  lost: number;
};

export type PendingRow = {
  order_no: string;
  party: string;
  quality: string;
  design: string;
  metres: number;
  value: number;
  waiting_on: string;
  days_open: number;
  days_since_move: number | null;
};

export type ProductionDashboard = {
  analysis: ReportAnalysis;
  total: number;
  open: number;
  stages: StageRow[];
  waiting: Slice[];
  ageing: Slice[];
  byParty: Slice[];
  pending: PendingRow[];
  pendingTotal: number;
};

const AGE_ORDER = ["0–7 days", "8–15 days", "16–30 days", "31–60 days", "Over 60 days"];

export async function productionDashboard(params: ReportParams): Promise<ProductionDashboard> {
  const prod = await productionStatus.run(params);
  const rows = prod.rows;
  const total = rows.length;

  const stages: StageRow[] = STAGES.map((st, i) => {
    const done = rows.filter((r) => r[`s${i}_done`] === true);
    const late = done.map((r) => n(r[`s${i}_late`])).filter((x) => Number.isFinite(x));
    return {
      no: i + 1,
      label: st.label,
      done: done.length,
      pct: total ? (done.length / total) * 100 : 0,
      avgLate: late.length ? late.reduce((a, b) => a + b, 0) / late.length : null,
      lost: 0,
    };
  });
  for (let i = 1; i < stages.length; i++) stages[i].lost = stages[i - 1].done - stages[i].done;

  const openRows = rows.filter((r) => r.open === true);
  const waiting = new Map<string, number>();
  const ageing = new Map<string, number>();
  const byParty = new Map<string, number>();
  for (const r of openRows) {
    add(waiting, s(r.waiting_on), 1);
    add(ageing, s(r.age_bucket), 1);
    add(byParty, s(r.party_name).trim() || "Not recorded", n(r.line_total));
  }

  // The oldest open lines — the action list, the same shape the owner's
  // reference "Pending Quantity" table has. Ordered by age with a name
  // tiebreak so the same period always prints the same fifteen.
  const pending: PendingRow[] = openRows
    .map((r) => ({
      order_no: s(r.order_no),
      party: s(r.party_name),
      quality: s(r.quality),
      design: s(r.design_no),
      metres: n(r.qty_mtr),
      value: n(r.line_total),
      waiting_on: s(r.waiting_on),
      days_open: n(r.days_open),
      days_since_move: r.days_since_move == null ? null : n(r.days_since_move),
    }))
    .sort(
      (a, b) =>
        b.days_open - a.days_open ||
        a.order_no.localeCompare(b.order_no) ||
        a.quality.localeCompare(b.quality) ||
        a.design.localeCompare(b.design),
    )
    .slice(0, 15);

  return {
    analysis: prod.analysis,
    total,
    open: openRows.length,
    stages,
    waiting: [...waiting]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => STAGES.findIndex((x) => x.label === a.label) - STAGES.findIndex((x) => x.label === b.label)),
    // Oldest last, so the bar chart reads left-to-right as time passing rather
    // than as a ranking.
    ageing: AGE_ORDER.filter((k) => ageing.has(k)).map((label) => ({ label, value: ageing.get(label) ?? 0 })),
    byParty: rank(byParty, 10).filter((x) => x.label !== "Others"),
    pending,
    pendingTotal: openRows.length,
  };
}

/** Row shape helper for the tables, kept here so the pages stay presentational. */
export type { ReportRow };
