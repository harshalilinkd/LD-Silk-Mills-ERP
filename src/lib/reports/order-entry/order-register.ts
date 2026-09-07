import "server-only";

import { sql as pg } from "@/db";
import { todayIso } from "@/lib/dates";
import {
  concentration,
  matrixFrom,
  monthDelta,
  concentrationInsight,
  contributorInsight,
  contributors,
  rank,
  runRate,
  spread,
  trend,
  trendInsight,
} from "../analysis";
import { count, inr, inrShort, monthName, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Order register — one row per order
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The biggest and most demanding of the thirty-seven, which is why it is the
 * one the engine was proved on. It joins the order header to its lines, rolls
 * up quantity and value, and works out where the order has reached without
 * fetching forty thousand stage rows into JavaScript.
 *
 * ── THE JOIN THAT INFLATES EVERY COUNT ───────────────────────────────────
 *
 * `customer_orders` joined to `order_line_items` returns one row per LINE. The
 * first version of this counted `count(*)` and reported 2,900 orders in July
 * against a true figure of 161 — an eighteen-fold error that looked entirely
 * plausible on a dashboard. Every count of orders in this file is
 * `count(distinct o.id)`, and the aggregation happens in a subquery so the
 * header row can never be multiplied by its own lines.
 *
 * ── WHAT "CANCELLED" AND "DELETED" MEAN HERE ─────────────────────────────
 *
 * A cancelled line stays in the order and is reported — it is a real thing
 * that happened, and cancellation value is one of the numbers worth watching.
 * It is simply excluded from the order's value, quantity and rate so those
 * describe what will actually be delivered. A deleted line is excluded
 * everywhere: it was a mistake being unmade, not an event.
 */

const REGISTER_SQL = `
  with lines as (
    select
      li.order_id,
      count(*)                                                                  as line_count,
      count(*) filter (where li.is_cancelled)                                   as cancelled_lines,
      coalesce(sum(li.qty_mtr)   filter (where not li.is_cancelled), 0)         as qty_mtr,
      coalesce(sum(li.line_total) filter (where not li.is_cancelled), 0)        as value,
      coalesce(sum(li.line_total) filter (where li.is_cancelled), 0)            as cancelled_value,
      -- LIVE lines only. Counting cancelled ones made this report say 226
      -- qualities where the line detail said 223 over the same period.
      count(distinct li.quality)   filter (where not li.is_cancelled)           as qualities,
      count(distinct li.design_no) filter (where not li.is_cancelled)           as designs,
      -- Lines whose quality AND design already appear on this order. The
      -- order's totals stay right either way; this is here so a reader
      -- comparing the sheet against a printout knows the repeat is real.
      count(*) filter (where not li.is_cancelled)
        - count(distinct (li.quality, li.design_no)) filter (where not li.is_cancelled) as repeated_lines
    from ld_order_entry.order_line_items li
    where not li.is_deleted
    group by li.order_id
  ),
  progress as (
    -- Where the order has reached: the furthest stage every one of its live
    -- lines has finished. "Furthest stage ANY line reached" would call an
    -- order dispatched because one line of forty was.
    select
      li.order_id,
      min(done.reached) as reached
    from ld_order_entry.order_line_items li
    join lateral (
      select coalesce(max(ws.sort_order), 0) as reached
      from ld_order_entry.line_stage_progress p
      join ld_order_entry.workflow_stages ws on ws.stage_key = p.stage_key
      where p.order_line_item_id = li.id and p.is_done
    ) done on true
    where not li.is_deleted and not li.is_cancelled
    group by li.order_id
  )
  select
    o.order_no,
    o.order_date,
    o.party_name,
    o.agent,
    o.sales_person,
    o.transport,
    o.haste,
    o.lot_no,
    o.challan_no,
    coalesce(l.line_count, 0)       as line_count,
    coalesce(l.cancelled_lines, 0)  as cancelled_lines,
    coalesce(l.qualities, 0)        as qualities,
    coalesce(l.designs, 0)          as designs,
    coalesce(l.repeated_lines, 0)   as repeated_lines,
    coalesce(l.qty_mtr, 0)          as qty_mtr,
    coalesce(l.value, 0)            as value,
    coalesce(l.cancelled_value, 0)  as cancelled_value,
    case when coalesce(l.qty_mtr, 0) > 0
         then coalesce(l.value, 0) / l.qty_mtr end as avg_rate,
    coalesce(ws.label, 'Not started') as stage,
    (o.crr_customer_id is not null)   as in_crr,
    o.remarks,
    o.created_by,
    o.created_at
  from ld_order_entry.customer_orders o
  left join lines    l  on l.order_id = o.id
  left join progress pr on pr.order_id = o.id
  left join ld_order_entry.workflow_stages ws on ws.sort_order = pr.reached
  where ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    and ($3::text is null or o.party_name   = $3::text)
    and ($4::text is null or o.agent        = $4::text)
    and ($5::text is null or o.sales_person = $5::text)
  -- Ends in the row's own id. Without a unique tiebreak Postgres is free to
  -- return equal rows in a different order every run, and the same report
  -- run twice would produce two differently-ordered files.
  order by o.order_date desc, o.order_no desc, o.id
`;

type Raw = {
  order_no: string;
  order_date: string;
  party_name: string | null;
  agent: string | null;
  sales_person: string | null;
  transport: string | null;
  haste: string | null;
  lot_no: string | null;
  challan_no: string | null;
  line_count: number;
  cancelled_lines: number;
  qualities: number;
  designs: number;
  repeated_lines: number;
  qty_mtr: string;
  value: string;
  cancelled_value: string;
  avg_rate: string | null;
  stage: string;
  in_crr: boolean;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
};

const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

/** Not started, then the seven stages in order — so a funnel reads downwards. */
const STAGE_ORDER = [
  "Not started",
  "Order Entry",
  "Stock Checking",
  "Rolling & Checking",
  "Challan",
  "Bill",
  "Dispatch",
  "Received LR",
];

async function distinctValues(column: string): Promise<{ value: string; label: string }[]> {
  // The column name is a literal from this file, never from a request.
  const rows = await pg.unsafe(
    `select distinct ${column} as v from ld_order_entry.customer_orders
      where ${column} is not null and ${column} <> '' order by 1`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
}

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(REGISTER_SQL, [
    params.from ?? null,
    params.to ?? null,
    params.party ?? null,
    params.agent ?? null,
    params.salesPerson ?? null,
  ])) as unknown as Raw[];

  const totalRows = raw.length;
  const capped = raw.slice(0, MAX_EXPORT_ROWS);

  const rows: ReportRow[] = capped.map((r) => ({
    order_no: r.order_no,
    order_date: r.order_date?.slice(0, 10) ?? null,
    party_name: r.party_name,
    agent: r.agent,
    sales_person: r.sales_person,
    transport: r.transport,
    haste: r.haste,
    stage: r.stage,
    line_count: n(r.line_count),
    cancelled_lines: n(r.cancelled_lines),
    qualities: n(r.qualities),
    designs: n(r.designs),
    repeated_lines: n(r.repeated_lines),
    qty_mtr: n(r.qty_mtr),
    value: n(r.value),
    // Rounded here, not left to the cell format: the CSV has no format to
    // hide behind, and 190.58064516129033 in a rate column looks like a bug.
    avg_rate: r.avg_rate === null ? null : Math.round(n(r.avg_rate) * 100) / 100,
    cancelled_value: n(r.cancelled_value),
    lot_no: r.lot_no,
    challan_no: r.challan_no,
    in_crr: r.in_crr,
    remarks: r.remarks,
    created_by: r.created_by,
    created_at: r.created_at,
  }));

  // ── the analysis, over every matching row (not just the capped ones) ────
  const totalValue = raw.reduce((s, r) => s + n(r.value), 0);
  const totalQty = raw.reduce((s, r) => s + n(r.qty_mtr), 0);
  const cancelledValue = raw.reduce((s, r) => s + n(r.cancelled_value), 0);
  const cancelledLines = raw.reduce((s, r) => s + n(r.cancelled_lines), 0);
  const lineCount = raw.reduce((s, r) => s + n(r.line_count), 0);

  const byMonth = new Map<string, number>();
  const byParty = new Map<string, number>();
  const byAgent = new Map<string, number>();
  const bySales = new Map<string, number>();
  const byStage = new Map<string, number>();
  const partyOrders = new Map<string, number>();

  for (const r of raw) {
    const month = (r.order_date ?? "").slice(0, 7);
    const v = n(r.value);
    if (month) byMonth.set(month, (byMonth.get(month) ?? 0) + v);
    const party = r.party_name?.trim() || "Not recorded";
    byParty.set(party, (byParty.get(party) ?? 0) + v);
    partyOrders.set(party, (partyOrders.get(party) ?? 0) + 1);
    byAgent.set(r.agent?.trim() || "No agent", (byAgent.get(r.agent?.trim() || "No agent") ?? 0) + v);
    bySales.set(r.sales_person?.trim() || "Not recorded", (bySales.get(r.sales_person?.trim() || "Not recorded") ?? 0) + v);
    byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
  }

  const repeatedLines = raw.reduce((s, r) => s + n(r.repeated_lines), 0);
  const repeatedOrders = raw.filter((r) => n(r.repeated_lines) > 0).length;

  const conc = concentration([...byParty].map(([label, value]) => ({ label, value })));
  const t = trend(byMonth, inrShort);
  const rateSpread = spread(raw.map((r) => n(r.avg_rate)).filter((x) => x > 0));

  // Month-on-month movers, so the dashboard answers "what happened" and not
  // only "who is big".
  const months = [...byMonth.keys()].sort();
  const thisMonth = months.at(-1);
  const lastMonth = months.at(-2);
  const partyIn = (m: string | undefined) => {
    const out = new Map<string, number>();
    if (!m) return out;
    for (const r of raw) {
      if ((r.order_date ?? "").slice(0, 7) !== m) continue;
      const p = r.party_name?.trim() || "Not recorded";
      out.set(p, (out.get(p) ?? 0) + n(r.value));
    }
    return out;
  };
  const movers = contributors(partyIn(thisMonth), partyIn(lastMonth));

  // Run rate, only when the period runs to today — projecting a month that
  // ended three weeks ago is nonsense dressed as forecasting.
  const today = todayIso();
  const endsToday = !params.to || params.to >= today;
  const day = Number(today.slice(8, 10));
  const daysThisMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const projected =
    endsToday && thisMonth === today.slice(0, 7)
      ? runRate(byMonth.get(thisMonth) ?? 0, day, daysThisMonth)
      : null;

  const insights: string[] = [];
  const ci = concentrationInsight(conc, "customers");
  if (ci) insights.push(ci);
  const ti = trendInsight(t, "order value");
  if (ti) insights.push(ti);
  const mi = contributorInsight(movers, inrShort, "customers");
  if (mi && lastMonth) insights.push(mi);
  if (cancelledValue > 0) {
    insights.push(
      `${count(cancelledLines)} of ${count(lineCount)} lines were cancelled, worth ${inrShort(cancelledValue)} — ` +
        `${pct((cancelledValue / (totalValue + cancelledValue)) * 100, 2)} of everything written.`,
    );
  }
  if (rateSpread.median !== null && rateSpread.max !== null && rateSpread.min !== null) {
    insights.push(
      `The middle order sells at ${inr(rateSpread.median)} a metre; the range runs ${inr(rateSpread.min)} to ${inr(rateSpread.max)}.`,
    );
  }
  if (projected !== null) {
    insights.push(
      `${monthName(thisMonth!)} stands at ${inrShort(byMonth.get(thisMonth!) ?? 0)} after ${day} days — ` +
        `on track for roughly ${inrShort(projected)} if the rest of the month looks like the start.`,
    );
  }

  if (repeatedLines > 0) {
    insights.push(
      `${count(repeatedOrders)} orders list the same cloth and design more than once — ${count(repeatedLines)} extra lines in all. ` +
        `The totals are right either way, but it is usually a slip during entry and worth checking before an order is quoted.`,
    );
  }

  const caveats: string[] = [
    "Order value excludes cancelled lines, so it is what should actually be delivered. Cancelled value is reported separately.",
    "Stage is the furthest point EVERY live line of the order has passed. One line still at stock checking holds the whole order there.",
  ];
  if (totalRows > MAX_EXPORT_ROWS) {
    caveats.push(
      `Only the first ${count(MAX_EXPORT_ROWS)} of ${count(totalRows)} orders are in the Data sheet. The figures above cover all ${count(totalRows)}.`,
    );
  }

  return {
    rows,
    totalRows,
    analysis: {
      headline:
        conc.topShare !== null && conc.topLabel
          ? `${inrShort(totalValue)} of orders from ${count(conc.n)} customers — and ${conc.topLabel} alone is ${pct(conc.topShare)} of it.`
          : `${inrShort(totalValue)} of orders across ${count(raw.length)} orders.`,
      kpis: [
        {
          label: "Order value",
          value: inrShort(totalValue),
          tone: "neutral",
          sub: "cancelled lines left out",
          deltaPct: monthDelta(byMonth),
        },
        { label: "Orders", value: count(raw.length), tone: "good", sub: `${count(lineCount)} lines` },
        { label: "Metres", value: qty(Math.round(totalQty)), tone: "neutral" },
        {
          label: "Average rate",
          value: totalQty > 0 ? inr(totalValue / totalQty) : "—",
          tone: "neutral",
          sub: "per metre",
        },
        {
          label: "Cancelled",
          lowerIsBetter: true,
          value: totalValue + cancelledValue > 0
            ? pct((cancelledValue / (totalValue + cancelledValue)) * 100, 2)
            : "—",
          tone: cancelledValue > 0 ? "bad" : "good",
          sub: inrShort(cancelledValue),
        },
        {
          label: "Customers",
          // byParty, not conc.n — the concentration helper drops names with no
          // live value, which made this read 199 while the customer ledger
          // read 201 for the same period. Two reports must not disagree on how
          // many customers there were.
          value: count(byParty.size),
          tone: "neutral",
          sub: conc.top5Share !== null ? `top 5 = ${pct(conc.top5Share, 0)}` : undefined,
        },
        {
          label: "Agents",
          value: count(byAgent.size),
          tone: "neutral",
        },
        {
          label: "Lines listed twice",
          value: count(repeatedLines),
          tone: repeatedLines > 0 ? "warn" : "good",
          lowerIsBetter: true,
          sub: repeatedOrders > 0 ? `across ${count(repeatedOrders)} orders` : "none to check",
        },
        {
          label: "Largest customer",
          value: conc.topShare !== null ? pct(conc.topShare) : "—",
          tone: conc.topShare !== null && conc.topShare > 20 ? "warn" : "neutral",
          sub: conc.topLabel ?? undefined,
        },
      ],
      trend: {
        title: "How much was ordered each month",
        valueLabel: "Order value",
        points: t.points,
        averageLabel: "Average month in this period",
      },
      matrix: matrixFrom(
        raw.map((r) => ({
          label: r.party_name?.trim() || "Not recorded",
          month: (r.order_date ?? "").slice(0, 7),
          value: n(r.value),
        })),
        {
          title: "Which customers ordered, and when",
          format: "money",
          display: inrShort,
          note: "A pale month is a quiet one.",
        },
      ),
      panels: [
        {
          title: "Where the money came from",
          valueLabel: "Value",
          note: "The biggest customers in this period.",
          rows: rank(
            [...byParty].map(([label, value]) => ({
              label,
              value,
              meta: `${partyOrders.get(label) ?? 0} orders`,
            })),
            inrShort,
          ),
        },
        {
          title: "How much of it is a few names",
          valueLabel: "Value",
          kind: "share",
          rows: rank([...byParty].map(([label, value]) => ({ label, value })), inrShort, 5),
          note: "A wide first block means the business leans on a few customers.",
        },
        {
          title: "Which agents brought it in",
          valueLabel: "Value",
          rows: rank([...byAgent].map(([label, value]) => ({ label, value })), inrShort),
        },
        {
          title: "How far the orders have got",
          valueLabel: "Orders",
          kind: "funnel",
          // In STAGE order, not by size. A funnel drawn from a ranked list
          // indents Received LR above Challan and reads as a descent that goes
          // backwards — these are resting places along a fixed path.
          rows: STAGE_ORDER.map((label) => ({
            label,
            value: byStage.get(label) ?? 0,
            display: count(byStage.get(label) ?? 0),
            share: raw.length ? ((byStage.get(label) ?? 0) / raw.length) * 100 : 0,
          })).filter((x) => x.value > 0),
          note: "Where each order is resting. An order counts as past a stage only once every line of it is.",
        },
      ],
      insights,
      caveats,
    },
  };
}

export const orderRegister: ReportDefinition = {
  id: "order-entry.order-register",
  module: "order-entry",
  title: "Order register",
  description:
    "Every order at header level — party, agent, sales person, transport, how many lines, how many metres, what it is worth, and where it has reached.",
  defaultMonthsBack: 3,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 32 },
    { key: "agent", label: "Agent", type: "text", width: 22 },
    { key: "sales_person", label: "Sales person", type: "text", width: 18 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "haste", label: "Haste", type: "text", width: 12 },
    { key: "stage", label: "Reached", type: "text", width: 17, note: "The furthest stage every live line of this order has finished." },
    { key: "line_count", label: "Lines", type: "int" },
    { key: "cancelled_lines", label: "Cancelled lines", type: "int" },
    { key: "qualities", label: "Qualities", type: "int", total: "none", note: "Distinct qualities on this order. Not added up at the foot — the same quality on two orders is one quality." },
    { key: "designs", label: "Designs", type: "int", total: "none", note: "Distinct designs on this order. Not added up, for the same reason." },
    { key: "repeated_lines", label: "Listed twice", type: "int", note: "How many lines repeat a quality and design already on this order. Usually a slip during entry. The order's totals are correct either way." },
    { key: "qty_mtr", label: "Metres", type: "number", note: "Cancelled lines excluded." },
    { key: "value", label: "Value", type: "money", note: "Cancelled lines excluded — what should actually be delivered." },
    { key: "avg_rate", label: "Avg rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Value divided by metres, for this order. The foot shows the rate across the whole file, weighted by metres." },
    { key: "cancelled_value", label: "Cancelled value", type: "money" },
    { key: "lot_no", label: "Lot no", type: "text", width: 14 },
    { key: "challan_no", label: "Challan no", type: "text", width: 14 },
    { key: "in_crr", label: "In CRR", type: "boolean", note: "Whether this customer is matched to the CRR customer master." },
    { key: "remarks", label: "Remarks", type: "text", width: 34 },
    { key: "created_by", label: "Entered by", type: "text", width: 22 },
    { key: "created_at", label: "Entered at", type: "datetime" },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
