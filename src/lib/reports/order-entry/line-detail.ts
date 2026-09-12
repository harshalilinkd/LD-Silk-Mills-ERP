import "server-only";

import { sql as pg } from "@/db";
import {
  concentration,
  concentrationInsight,
  matrixFrom,
  monthDelta,
  rank,
  spread,
  trend,
  trendInsight,
} from "../analysis";
import { count, inr, inrShort, pct, qty } from "../format";
import { LAST_FLOW_STAGE_KEY } from "../../order-entry/workflow-constants";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import {
  CANCELLED_CAVEAT,
  distinctLineValues,
  distinctValues,
  money2,
  n,
  ORDER_FILTER_SQL,
  orderFilterArgs,
} from "./shared";

/**
 * Order line detail — one row per line, the grain everything else rolls up from.
 *
 * The widest report in the module by row count (5,857 lines over the full
 * period) and the one most likely to be taken into somebody's own pivot table,
 * which is why every dimension the line touches is carried on it: the order's
 * party, agent and transport as well as the line's own fabric and design.
 * Denormalised on purpose — a pivot cannot join.
 */

const SQL = `
  select
    o.order_no,
    o.order_date,
    o.party_name,
    o.agent,
    o.sales_person,
    o.transport,
    li.quality,
    li.design_no,
    li.qty_mtr,
    li.rate,
    li.line_total,
    li.is_cancelled,
    coalesce(ws.label, 'Not started') as stage,
    ws.stage_key as reached_key,
    -- The same quality AND design appearing more than once inside one order.
    -- Almost always a slip during entry, and every report was reproducing it
    -- silently: the order's totals are right, but a reader comparing the sheet
    -- with the order sees the same fabric twice and cannot tell whether it is a
    -- real split delivery or a mistake.
    (count(*) over (partition by li.order_id, li.quality, li.design_no) > 1) as repeated,
    li.remarks,
    o.lot_no,
    o.challan_no
  from ld_order_entry.order_line_items li
  join ld_order_entry.customer_orders o on o.id = li.order_id
  left join lateral (
    -- Only reached is used. An earlier version also selected
    -- max(stage_key), which is a MAX over TEXT and sorts stock_checking
    -- above bill — meaningless, and exactly the sort of thing that survives
    -- because nothing reads it.
    select max(w2.sort_order) filter (where p2.is_done) as reached
    from ld_order_entry.line_stage_progress p2
    join ld_order_entry.workflow_stages w2 on w2.stage_key = p2.stage_key
    where p2.order_line_item_id = li.id
  ) done on true
  left join ld_order_entry.workflow_stages ws on ws.sort_order = done.reached
  where not li.is_deleted
    and ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
    and ($6::text is null or li.quality   = $6::text)
    and ($7::text is null or li.design_no = $7::text)
  order by o.order_date desc, o.order_no desc, li.quality, li.design_no, li.id
`;

type Raw = {
  order_no: string; order_date: string; party_name: string | null; agent: string | null;
  sales_person: string | null; transport: string | null; quality: string | null;
  design_no: string | null; qty_mtr: string; rate: string; line_total: string;
  is_cancelled: boolean; stage: string; reached_key: string | null; repeated: boolean; remarks: string | null;
  lot_no: string | null; challan_no: string | null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Completed / In process / Cancelled, for the pivot's status slicer — not a
 * new judgement, the house rule already used everywhere else a line's
 * progress is judged (`computeLineStatus` in `workflow-constants.ts`),
 * simplified to what this report's SQL actually carries: the furthest stage
 * REACHED, not every stage's own done flag, so "on hold" cannot be told
 * apart from "reached its last stage normally" here the way the live board
 * can. Cancellation is checked first because it is a separate flag, not a
 * position in the workflow.
 */
function pivotStatus(r: Pick<Raw, "is_cancelled" | "reached_key">): "Cancelled" | "Completed" | "In process" {
  if (r.is_cancelled) return "Cancelled";
  return r.reached_key === LAST_FLOW_STAGE_KEY ? "Completed" : "In process";
}

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [
    ...orderFilterArgs(params),
    params.quality ?? null,
    params.design ?? null,
  ])) as unknown as Raw[];

  const sliced = raw.slice(0, MAX_EXPORT_ROWS);
  const rows: ReportRow[] = sliced.map((r) => ({
    order_no: r.order_no,
    order_date: r.order_date?.slice(0, 10) ?? null,
    party_name: r.party_name,
    agent: r.agent,
    sales_person: r.sales_person,
    transport: r.transport,
    quality: r.quality,
    design_no: r.design_no,
    qty_mtr: n(r.qty_mtr),
    rate: money2(r.rate),
    line_total: money2(r.line_total),
    is_cancelled: r.is_cancelled,
    repeated: r.repeated,
    stage: r.stage,
    lot_no: r.lot_no,
    challan_no: r.challan_no,
    remarks: r.remarks,
  }));

  const live = raw.filter((r) => !r.is_cancelled);
  const cancelled = raw.filter((r) => r.is_cancelled);
  const value = live.reduce((s, r) => s + n(r.line_total), 0);
  const metres = live.reduce((s, r) => s + n(r.qty_mtr), 0);
  const cancelledValue = cancelled.reduce((s, r) => s + n(r.line_total), 0);

  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const byMonth = new Map<string, number>();
  const byQuality = new Map<string, number>();
  const byDesign = new Map<string, number>();
  const byParty = new Map<string, number>();
  // Every party in the file, cancelled lines included — the count the order
  // register reports.
  const allParties = new Set(raw.map((r) => (r.party_name as string | null)?.trim() || "Not recorded")).size;
  const qtyByQuality = new Map<string, number>();
  for (const r of live) {
    add(byMonth, (r.order_date ?? "").slice(0, 7), n(r.line_total));
    add(byQuality, r.quality?.trim() || "Not recorded", n(r.line_total));
    add(qtyByQuality, r.quality?.trim() || "Not recorded", n(r.qty_mtr));
    // Keyed by FABRIC AND DESIGN. A design number is only unique inside its
    // own fabric, so keying on the number alone added LIO LINEN's "1" to
    // CORDRAY's "1" and reported a ₹40.2 L design that is really 213 lines
    // across 89 fabrics.
    add(
      byDesign,
      `${r.quality?.trim() || "Not recorded"} · ${r.design_no?.trim() || "Not recorded"}`,
      n(r.line_total),
    );
    add(byParty, r.party_name?.trim() || "Not recorded", n(r.line_total));
  }
  byMonth.delete("");

  const t = trend(byMonth, inrShort);
  const rateSpread = spread(live.map((r) => n(r.rate)).filter((x) => x > 0));
  const qConc = concentration([...byQuality].map(([label, v]) => ({ label, value: v })));

  const insights: string[] = [];
  const ti = trendInsight(t, "line value");
  if (ti) insights.push(ti);
  const qi = concentrationInsight(qConc, "fabrics");
  if (qi) insights.push(qi);
  if (rateSpread.median !== null) {
    insights.push(
      `Half of all lines sell between ${inr(rateSpread.p25)} and ${inr(rateSpread.p75)} a metre, around a middle of ${inr(rateSpread.median)}. ` +
        `The mean is ${inr(rateSpread.mean)} — the gap between the two is what a handful of very high-rate lines do to an average.`,
    );
  }
  if (cancelled.length) {
    insights.push(
      `${count(cancelled.length)} lines worth ${inrShort(cancelledValue)} were cancelled — ` +
        `${pct((cancelledValue / (value + cancelledValue)) * 100, 2)} of everything written.`,
    );
  }
  if (live.length) insights.push(
    `${count(byDesign.size)} fabric-and-design pairs across ${count(byQuality.size)} fabrics went to ${count(byParty.size)} customers.` +
      // The order register counts every customer who placed an order; this
      // counts the ones with a line still standing. Where they differ, say so
      // — two reports quietly printing 202 and 204 is a question nobody
      // should have to ask.
      (allParties > byParty.size
        ? ` ${count(allParties - byParty.size)} more appear in the file with every line cancelled.`
        : ""),
  );

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${count(live.length)} lines worth ${inrShort(value)} — ${count(byDesign.size)} fabric-and-design pairs across ${count(byQuality.size)} fabrics.`
        : "No lines in this period.",
      kpis: [
        { label: "Line value", value: inrShort(value), sub: "cancelled left out", deltaPct: monthDelta(byMonth) },
        {
          label: "All lines written",
          value: inrShort(value + cancelledValue),
          sub: "including cancelled — matches the sheet's Total row",
        },
        { label: "Lines", value: count(live.length), tone: "good", sub: `${count(cancelled.length)} cancelled` },
        { label: "Metres", value: qty(Math.round(metres)), sub: "cancelled left out" },
        { label: "Average rate", value: metres > 0 ? inr(value / metres) : "—", sub: "per metre" },
        { label: "Fabrics", value: count(byQuality.size) },
        { label: "Fabric-and-design pairs", value: count(byDesign.size), sub: "a design number only means something inside its own fabric" },
        { label: "Middle rate per line", value: inr(rateSpread.median), sub: "half the lines are above, half below" },
        { label: "Cheapest to dearest", value: `${inr(rateSpread.min)} – ${inr(rateSpread.max)}`, tone: "warn", sub: "per metre" },
      ],
      trend: {
        title: "How much was sold each month",
        valueLabel: "Line value",
        points: t.points,
        averageLabel: "Average month in this period",
      },
      matrix: matrixFrom(
        live.map((r) => ({
          label: r.quality?.trim() || "Not recorded",
          month: (r.order_date ?? "").slice(0, 7),
          value: n(r.line_total),
        })),
        {
          title: "Which fabric sold, and when",
          format: "money",
          display: inrShort,
          // Was capped at the house default of 8 — a fifth of the fabrics
          // this report tracks (some periods carry 200+). Raised so the
          // grid on the Dashboard page itself carries most of the book,
          // not just a taste of it; the Data sheet still has every fabric.
          limit: 40,
        },
      ),
      panels: [
        {
          title: "Which fabric earns most",
          valueLabel: "Value",
          rows: rank(
            [...byQuality].map(([label, v]) => ({
              label,
              value: v,
              meta: `${qty(Math.round(qtyByQuality.get(label) ?? 0))} m`,
            })),
            inrShort,
          ),
        },
        {
          title: "Is it a few fabrics or many",
          valueLabel: "Value",
          kind: "share",
          rows: rank([...byQuality].map(([label, v]) => ({ label, value: v })), inrShort, 5),
          note: "How much of the money comes from the top few fabrics.",
        },
        {
          title: "Which designs earn most",
          valueLabel: "Value",
          rows: rank([...byDesign].map(([label, v]) => ({ label, value: v })), inrShort),
          note: "Fabric then design. A design number only means something inside its own fabric, so they are never added together across fabrics.",
        },
        { title: "Which fabric moves most metres", valueLabel: "Metres", rows: rank([...qtyByQuality].map(([label, v]) => ({ label, value: v })), (x) => qty(Math.round(x))) },
      ],
      insights,
      caveats: [
        CANCELLED_CAVEAT,
        "Cancelled lines ARE included as rows, flagged in their own column, so the file is a complete record of what was written. That is why the Total row on the Data sheet adds to more than the Line value above — the dashboard shows both figures.",
        ...(raw.length > MAX_EXPORT_ROWS
          ? [`Only the first ${count(MAX_EXPORT_ROWS)} of ${count(raw.length)} lines are in the Data sheet. The figures above cover all of them.`]
          : []),
        "On the “Pivot - Fabric rate” sheet, “Avg rate (unweighted)” is Excel's plain average of the line rates — it counts a 6-metre line the same as a 6,000-metre one. The rate this report quotes everywhere else is WEIGHTED by metres, and you get it from the same sheet by dividing Sum of value by Sum of metres, at any level including the subtotals.",
      ],
      // Real Excel PivotTables + Slicers, on their own sheets — every
      // fabric and every party, filterable by status/agent/sales
      // person/year/month, not just the Dashboard's top-40 heat grid.
      // See `xlsx-pivot.ts` for how these are built safely.
      pivots: {
        extraFields: [
          { name: "Status", values: sliced.map((r) => pivotStatus(r)) },
          { name: "Year", values: sliced.map((r) => (r.order_date ? r.order_date.slice(0, 4) : null)) },
          {
            name: "Month",
            values: sliced.map((r) => {
              if (!r.order_date) return null;
              const m = Number(r.order_date.slice(5, 7));
              return Number.isInteger(m) && m >= 1 && m <= 12
                ? `${MONTH_NAMES[m - 1]} ${r.order_date.slice(0, 4)}`
                : null;
            }),
          },
        ],
        tables: [
          {
            // Party, then the fabrics under it — nested down the ROWS, not
            // fabrics down and parties across. The across version was built
            // first and was wrong to read: 223 columns wide, so any two
            // parties a manager wanted to compare were several screens
            // apart and most cells were blank. Nested rows give one line per
            // party-and-fabric with a subtotal per party, which is the shape
            // somebody actually reads down.
            rowFields: ["party_name", "quality"],
            dataFields: [{ field: "line_total", label: "Sum of line value" }],
            slicerFields: ["Status", "Year", "Month"],
            sheetName: "Pivot - Fabric",
            pivotTableName: "PartyAndFabric",
          },
          {
            // Who bought it: one row per party, metres and value side by
            // side, sliceable by agent and sales person as well as status
            // and period — the commercial rollup, not the production one.
            rowFields: ["party_name"],
            dataFields: [
              { field: "qty_mtr", label: "Sum of metres" },
              { field: "line_total", label: "Sum of value" },
            ],
            slicerFields: ["agent", "sales_person", "Status", "Year", "Month"],
            sheetName: "Pivot - Party",
            pivotTableName: "PartyRollup",
          },
          {
            // Fabric, quantity and rate — the cloth view.
            //
            // ── WHY THREE COLUMNS FOR "QTY AND RATE" ──────────────────────
            //
            // The rate that matters is WEIGHTED: total value over total
            // metres, so a 6,000-metre line counts more than a 6-metre one
            // (the same rule `ReportColumn.avgWeightBy` sets on the Rate
            // column itself). Excel can only express that as a calculated
            // field, and this Excel refuses to create one — so rather than
            // ship a single "Rate" column that is quietly the wrong
            // average, both ingredients are here: metres and value, whose
            // ratio IS the weighted rate at every level including the
            // subtotals. The third column is Excel's plain mean of the line
            // rates, named so nobody mistakes it for the weighted one.
            rowFields: ["quality"],
            dataFields: [
              { field: "qty_mtr", label: "Sum of metres" },
              { field: "line_total", label: "Sum of value" },
              { field: "rate", aggregate: "average", label: "Avg rate (unweighted)" },
            ],
            slicerFields: ["Status", "Year", "Month", "party_name"],
            sheetName: "Pivot - Fabric rate",
            pivotTableName: "FabricRate",
          },
        ],
      },
    },
  };
}

export const lineDetail: ReportDefinition = {
  id: "order-entry.line-detail",
  module: "order-entry",
  title: "Order line detail",
  description:
    "Every line of every order — fabric, design, metres, rate and value, with the order's party, agent and transport carried alongside so it pivots without a join.",
  defaultMonthsBack: 2,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 22 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "quality", label: "Fabric", type: "text", width: 26 },
    { key: "design_no", label: "Design no", type: "text", width: 16 },
    { key: "qty_mtr", label: "Metres", type: "number", unit: "MTR" },
    { key: "rate", label: "Rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Rupees a metre. The foot is weighted by metres, not a plain average of the rates — and it covers EVERY row in this sheet including the cancelled ones, so it differs slightly from the dashboard's Average rate, which is live lines only." },
    { key: "line_total", label: "Line value", type: "money" },
    { key: "is_cancelled", label: "Cancelled", type: "boolean",
      // The house example of why a badge is never inferred from the type:
      // "Cancelled: Yes" is bad where "Received: Yes" is good, and only the
      // column knows which.
      badge: { Yes: "bad" },
      note: "Cancelled lines are listed but excluded from every total above." },
    { key: "repeated", label: "Listed twice", type: "boolean",
      // Allowed, but worth a look — two rates or two lots, or a slip.
      badge: { Yes: "warn" },
      note: "The same fabric and design appears more than once on this order. Every member of the pair is flagged here, so a pair shows as two rows — the order register counts the EXTRA lines instead, so the same 29 repeats read as 29 there and 58 here. Allowed on purpose: two rates, or two lots." },
    { key: "stage", label: "Reached", type: "text", width: 17,
      badge: { "Not started": "warn" },
      note: "The furthest stage this LINE has finished." },
    { key: "lot_no", label: "Lot no", type: "text", width: 14 },
    { key: "challan_no", label: "Challan no", type: "text", width: 14 },
    { key: "remarks", label: "Remarks", type: "text", width: 32 },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
    { key: "quality", label: "Fabric", kind: "select", options: () => distinctLineValues("quality") },
    { key: "design", label: "Design no", kind: "select", options: () => distinctLineValues("design_no") },
  ],
  run,
};
