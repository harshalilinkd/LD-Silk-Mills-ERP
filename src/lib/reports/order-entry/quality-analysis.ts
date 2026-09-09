import "server-only";

import { sql as pg } from "@/db";
import { concentration, concentrationInsight, rank, spread } from "../analysis";
import { count, inr, inrShort, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { CANCELLED_CAVEAT, distinctLineValues, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * Fabric & design analysis — what actually sells.
 *
 * ── THE GRAIN IS QUALITY × DESIGN, AND THAT IS DELIBERATE ────────────────
 *
 * 233 fabrics and 1,355 designs, and a design number means something
 * different inside each quality. Rolling to quality alone hides that one
 * design is carrying a whole quality; rolling to design alone invents
 * comparisons between unrelated fabric. The pair is the grain the business
 * actually sells at, and the dashboard rolls it up both ways so neither view
 * is lost.
 *
 * ── SPREAD OF RATE, NOT JUST THE AVERAGE ─────────────────────────────────
 *
 * Every row carries the lowest and highest rate that fabric-design went out
 * at, alongside the average. A single number hides a design sold at ₹90 to one
 * customer and ₹210 to another, which is the most useful thing on the sheet.
 */

const SQL = `
  select
    coalesce(nullif(trim(li.quality), ''), 'Not recorded')   as quality,
    coalesce(nullif(trim(li.design_no), ''), 'Not recorded') as design_no,
    count(*)                                as lines,
    count(distinct o.id)                    as orders,
    count(distinct o.party_name)            as customers,
    coalesce(sum(li.qty_mtr), 0)            as qty_mtr,
    coalesce(sum(li.line_total), 0)         as value,
    min(li.rate)                            as min_rate,
    max(li.rate)                            as max_rate,
    percentile_cont(0.5) within group (order by li.rate) as median_rate,
    min(o.order_date)                       as first_sold,
    max(o.order_date)                       as last_sold,
    (array_agg(o.party_name order by li.line_total desc))[1] as top_customer
  from ld_order_entry.order_line_items li
  join ld_order_entry.customer_orders o on o.id = li.order_id
  where not li.is_deleted and not li.is_cancelled
    and ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
    and ($6::text is null or li.quality = $6::text)
  group by 1, 2
  order by 7 desc, 1, 2
`;

type Raw = {
  quality: string; design_no: string; lines: number; orders: number; customers: number;
  qty_mtr: string; value: string; min_rate: string; max_rate: string; median_rate: string;
  first_sold: string; last_sold: string; top_customer: string | null;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [...orderFilterArgs(params), params.quality ?? null])) as unknown as Raw[];
  const total = raw.reduce((s, r) => s + n(r.value), 0);

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
    quality: r.quality,
    design_no: r.design_no,
    lines: n(r.lines),
    orders: n(r.orders),
    customers: n(r.customers),
    qty_mtr: n(r.qty_mtr),
    value: money2(r.value),
    // Not rounded. With 2,716 rows the rounding loss made this column total
    // 73.8% instead of 100% — visible on the sheet, and indefensible.
    share: total > 0 ? (n(r.value) / total) * 100 : null,
    avg_rate: n(r.qty_mtr) > 0 ? money2(n(r.value) / n(r.qty_mtr)) : null,
    median_rate: money2(r.median_rate),
    min_rate: money2(r.min_rate),
    max_rate: money2(r.max_rate),
    rate_spread: money2(n(r.max_rate) - n(r.min_rate)),
    top_customer: r.top_customer,
    first_sold: r.first_sold?.slice(0, 10) ?? null,
    last_sold: r.last_sold?.slice(0, 10) ?? null,
  }));

  // Roll up both ways, so neither view is lost to the grain.
  const byQualityValue = new Map<string, number>();
  const byQualityQty = new Map<string, number>();
  const byQualityDesigns = new Map<string, Set<string>>();
  for (const r of raw) {
    byQualityValue.set(r.quality, (byQualityValue.get(r.quality) ?? 0) + n(r.value));
    byQualityQty.set(r.quality, (byQualityQty.get(r.quality) ?? 0) + n(r.qty_mtr));
    if (!byQualityDesigns.has(r.quality)) byQualityDesigns.set(r.quality, new Set());
    byQualityDesigns.get(r.quality)!.add(r.design_no);
  }

  const conc = concentration([...byQualityValue].map(([label, value]) => ({ label, value })));
  const rates = spread(raw.filter((r) => n(r.qty_mtr) > 0).map((r) => n(r.value) / n(r.qty_mtr)));
  // Where the same fabric went out at very different prices.
  const wideSpread = raw
    .filter((r) => n(r.lines) >= 3 && n(r.min_rate) > 0 && n(r.max_rate) / n(r.min_rate) >= 1.5)
    .sort((a, b) => n(b.value) - n(a.value));
  const singleCustomer = raw.filter((r) => n(r.customers) === 1 && n(r.value) > 0);

  const insights: string[] = [];
  const ci = concentrationInsight(conc, "fabrics");
  if (ci) insights.push(ci);
  if (raw.length) {
    const top = raw[0];
    insights.push(
      `The single biggest line item is ${top.quality} · ${top.design_no} at ${inrShort(n(top.value))} — ` +
        `${qty(Math.round(n(top.qty_mtr)))} metres to ${count(n(top.customers))} customer${n(top.customers) === 1 ? "" : "s"}.`,
    );
  }
  if (wideSpread.length) {
    const w = wideSpread[0];
    insights.push(
      `${count(wideSpread.length)} fabric-designs went out at rates more than half again apart. The largest is ` +
        `${w.quality} · ${w.design_no}: ${inr(n(w.min_rate))} to ${inr(n(w.max_rate))} a metre.`,
    );
  }
  if (singleCustomer.length) {
    insights.push(
      `${count(singleCustomer.length)} fabric-designs worth ${inrShort(singleCustomer.reduce((s, r) => s + n(r.value), 0))} went to exactly one customer — ` +
        `they stop selling the day that customer stops buying.`,
    );
  }
  if (rates.median !== null) {
    insights.push(
      `Across ${count(byQualityValue.size)} fabrics the middle rate is ${inr(rates.median)} a metre, with the middle half between ${inr(rates.p25)} and ${inr(rates.p75)}.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: !raw.length
        ? "No fabric was sold in this period."
        : `${count(byQualityValue.size)} fabrics and ${count(new Set(raw.map((r) => r.design_no)).size)} designs sold ${inrShort(total)}` +
          (conc.top5Share !== null ? ` — the top five fabrics are ${pct(conc.top5Share)} of it.` : "."),
      kpis: [
        { label: "Fabrics", value: count(byQualityValue.size), tone: "good" },
        { label: "Designs", value: count(new Set(raw.map((r) => r.design_no)).size) },
        { label: "Combinations", value: count(raw.length), sub: "fabric × design" },
        { label: "Total value", value: inrShort(total) },
        { label: "Metres", value: qty(Math.round(raw.reduce((s, r) => s + n(r.qty_mtr), 0))) },
        { label: "Middle fabric's rate", value: inr(rates.median), sub: "per metre, across fabric-and-design rows" },
        { label: "Sold at very different prices", value: count(wideSpread.length), tone: wideSpread.length ? "warn" : "good", lowerIsBetter: true, sub: "dearest is 50%+ above cheapest" },
        { label: "Only one buyer", value: count(singleCustomer.length), tone: "warn", lowerIsBetter: true },
      ],
      panels: [
        { title: "Which fabric earns most", valueLabel: "Value", rows: rank([...byQualityValue].map(([label, value]) => ({ label, value, meta: `${byQualityDesigns.get(label)?.size ?? 0} designs` })), inrShort) },
        {
          title: "How much comes from a few fabrics",
          valueLabel: "Value",
          kind: "share",
          rows: rank([...byQualityValue].map(([label, value]) => ({ label, value })), inrShort, 5),
        },
        { title: "Which designs earn most", valueLabel: "Value", rows: rank(raw.map((r) => ({ label: `${r.quality} · ${r.design_no}`, value: n(r.value) })), inrShort) },
        {
          title: "Same fabric, very different prices",
          valueLabel: "Range",
          rows: rank(wideSpread.map((r) => ({ label: `${r.quality} · ${r.design_no}`, value: n(r.max_rate) - n(r.min_rate), meta: `${inr(n(r.min_rate))}–${inr(n(r.max_rate))}` })), inr),
          note: "The gap between the cheapest and dearest sale of the same design. Worth asking why.",
        },
      ],
      insights,
      caveats: [
        CANCELLED_CAVEAT,
        "The grain is fabric × design. A quality's own totals are the sum of its designs, and the dashboard rolls it up both ways.",
        "A design number means something different inside each quality, so the same number under two fabrics is two different things and is never combined.",
      ],
    },
  };
}

export const qualityAnalysis: ReportDefinition = {
  id: "order-entry.quality-analysis",
  module: "order-entry",
  title: "Fabric & design analysis",
  description:
    "What sells — metres, value and rate for every quality-and-design pair, with the lowest and highest rate each one went out at.",
  defaultMonthsBack: 6,
  columns: [
    { key: "quality", label: "Fabric", type: "text", width: 28 },
    { key: "design_no", label: "Design no", type: "text", width: 16 },
    { key: "lines", label: "Lines", type: "int" },
    { key: "orders", label: "Orders", type: "int", total: "none", note: "Orders containing this fabric and design. NOT added up — one order holding six designs would be counted six times." },
    { key: "customers", label: "Customers", type: "int", total: "none", note: "Customers who bought it. Not added up, for the same reason." },
    { key: "qty_mtr", label: "Metres", type: "number", unit: "MTR" },
    { key: "value", label: "Value", type: "money" },
    { key: "share", label: "Share", type: "percent", total: "none", note: "Of the total value in this file's period. NOT added up at the foot — a share is already a share, and adding them gives 100. The rule its sibling percent columns already follow." },
    { key: "avg_rate", label: "Avg rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Value divided by metres — weighted, so a big line counts more. The foot is weighted the same way." },
    { key: "median_rate", label: "Middle rate", type: "money", total: "none", note: "The median line's rate — unweighted, so one big line cannot drag it. Not totalled: a median of medians means nothing." },
    { key: "min_rate", label: "Lowest rate", type: "money", total: "none" },
    { key: "max_rate", label: "Highest rate", type: "money", total: "none" },
    { key: "rate_spread", label: "Spread", type: "money", total: "avg", note: "Highest minus lowest, for this fabric. Averaged at the foot." },
    { key: "top_customer", label: "Biggest customer", type: "text", width: 30 },
    { key: "first_sold", label: "First sold", type: "date" },
    { key: "last_sold", label: "Last sold", type: "date" },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "quality", label: "Fabric", kind: "select", options: () => distinctLineValues("quality") },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
