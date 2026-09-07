import "server-only";

import { sql as pg } from "@/db";
import { concentration, concentrationInsight, rank, spread, trend, trendInsight } from "../analysis";
import { count, inr, inrShort, pct, qty } from "../format";
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
 * party, agent and transport as well as the line's own quality and design.
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
    li.remarks,
    o.lot_no,
    o.challan_no
  from ld_order_entry.order_line_items li
  join ld_order_entry.customer_orders o on o.id = li.order_id
  left join lateral (
    select max(p2.stage_key) filter (where p2.is_done) as k,
           max(w2.sort_order) filter (where p2.is_done) as reached
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
  order by o.order_date desc, o.order_no desc, li.quality, li.design_no
`;

type Raw = {
  order_no: string; order_date: string; party_name: string | null; agent: string | null;
  sales_person: string | null; transport: string | null; quality: string | null;
  design_no: string | null; qty_mtr: string; rate: string; line_total: string;
  is_cancelled: boolean; stage: string; remarks: string | null;
  lot_no: string | null; challan_no: string | null;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [
    ...orderFilterArgs(params),
    params.quality ?? null,
    params.design ?? null,
  ])) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
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
  const qtyByQuality = new Map<string, number>();
  for (const r of live) {
    add(byMonth, (r.order_date ?? "").slice(0, 7), n(r.line_total));
    add(byQuality, r.quality?.trim() || "Not recorded", n(r.line_total));
    add(qtyByQuality, r.quality?.trim() || "Not recorded", n(r.qty_mtr));
    add(byDesign, r.design_no?.trim() || "Not recorded", n(r.line_total));
    add(byParty, r.party_name?.trim() || "Not recorded", n(r.line_total));
  }
  byMonth.delete("");

  const t = trend(byMonth, inrShort);
  const rateSpread = spread(live.map((r) => n(r.rate)).filter((x) => x > 0));
  const qConc = concentration([...byQuality].map(([label, v]) => ({ label, value: v })));

  const insights: string[] = [];
  const ti = trendInsight(t, "line value");
  if (ti) insights.push(ti);
  const qi = concentrationInsight(qConc, "qualities");
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
  insights.push(
    `${count(byDesign.size)} designs across ${count(byQuality.size)} qualities went to ${count(byParty.size)} customers.`,
  );

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      kpis: [
        { label: "Line value", value: inrShort(value), sub: "cancelled excluded" },
        { label: "Lines", value: count(live.length), tone: "good", sub: `${count(cancelled.length)} cancelled` },
        { label: "Metres", value: qty(Math.round(metres)) },
        { label: "Average rate", value: metres > 0 ? inr(value / metres) : "—", sub: "per metre" },
        { label: "Qualities", value: count(byQuality.size) },
        { label: "Designs", value: count(byDesign.size) },
        { label: "Middle rate", value: inr(rateSpread.median), sub: "the median line" },
        { label: "Rate range", value: `${inr(rateSpread.min)} – ${inr(rateSpread.max)}`, tone: "warn" },
      ],
      trend: { title: "Line value by month", valueLabel: "Value", points: t.points },
      panels: [
        {
          title: "Top qualities by value",
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
        { title: "Top designs by value", valueLabel: "Value", rows: rank([...byDesign].map(([label, v]) => ({ label, value: v })), inrShort) },
        { title: "Top qualities by metres", valueLabel: "Metres", rows: rank([...qtyByQuality].map(([label, v]) => ({ label, value: v })), (x) => qty(Math.round(x))) },
        { title: "Top customers by value", valueLabel: "Value", rows: rank([...byParty].map(([label, v]) => ({ label, value: v })), inrShort) },
      ],
      insights,
      caveats: [
        CANCELLED_CAVEAT,
        "Cancelled lines ARE included as rows, flagged in their own column, so the file is a complete record of what was written.",
        ...(raw.length > MAX_EXPORT_ROWS
          ? [`Only the first ${count(MAX_EXPORT_ROWS)} of ${count(raw.length)} lines are in the Data sheet. The figures above cover all of them.`]
          : []),
      ],
    },
  };
}

export const lineDetail: ReportDefinition = {
  id: "order-entry.line-detail",
  module: "order-entry",
  title: "Order line detail",
  description:
    "Every line of every order — quality, design, metres, rate and value, with the order's party, agent and transport carried alongside so it pivots without a join.",
  defaultMonthsBack: 2,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 22 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "quality", label: "Quality", type: "text", width: 26 },
    { key: "design_no", label: "Design no", type: "text", width: 16 },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "rate", label: "Rate", type: "money", note: "Per metre, as written on the line." },
    { key: "line_total", label: "Line value", type: "money" },
    { key: "is_cancelled", label: "Cancelled", type: "boolean", note: "Cancelled lines are listed but excluded from every total above." },
    { key: "stage", label: "Reached", type: "text", width: 17, note: "The furthest stage this LINE has finished." },
    { key: "lot_no", label: "Lot no", type: "text", width: 14 },
    { key: "challan_no", label: "Challan no", type: "text", width: 14 },
    { key: "remarks", label: "Remarks", type: "text", width: 32 },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
    { key: "quality", label: "Quality", kind: "select", options: () => distinctLineValues("quality") },
    { key: "design", label: "Design no", kind: "select", options: () => distinctLineValues("design_no") },
  ],
  run,
};
