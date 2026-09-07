import "server-only";

import { sql as pg } from "@/db";
import { rank, spread } from "../analysis";
import { count, inr, inrShort, pct } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { CANCELLED_CAVEAT, distinctLineValues, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * Rate analysis — where a line was sold away from its own quality's norm.
 *
 * ── EVERY LINE IS COMPARED TO ITS OWN CLOTH, NOT TO THE BOOK ─────────────
 *
 * ₹90 a metre is cheap for one quality and expensive for another. A report
 * that ranks lines by absolute rate finds only the cheap cloth. So each line
 * carries its QUALITY'S median rate and the gap to it, in rupees and percent —
 * the question is "was this sold below what we normally get for this", which
 * is answerable, rather than "was this cheap", which is not.
 *
 * ── THE FENCE IS THE TEXTBOOK ONE ────────────────────────────────────────
 *
 * A line is flagged an outlier when it sits outside 1.5 × the interquartile
 * range of its own quality — the standard boxplot rule. That is a deliberately
 * boring choice: it needs no threshold anybody has to agree on, it adapts to
 * how varied each quality's pricing actually is, and it can be explained in a
 * sentence to whoever is asked about the line.
 *
 * A quality with fewer than five lines gets no fence at all. Three lines do not
 * establish a norm, and flagging against one is how a report loses its
 * credibility on its first outing.
 */

const MIN_LINES_FOR_NORM = 5;

const SQL = `
  with rated as (
    select
      o.order_no, o.order_date, o.party_name, o.agent, o.sales_person,
      coalesce(nullif(trim(li.quality), ''), 'Not recorded') as quality,
      li.design_no, li.qty_mtr, li.rate, li.line_total
    from ld_order_entry.order_line_items li
    join ld_order_entry.customer_orders o on o.id = li.order_id
    where not li.is_deleted and not li.is_cancelled and li.rate > 0
      and ($1::date is null or o.order_date >= $1::date)
      and ($2::date is null or o.order_date <= $2::date)
      ${ORDER_FILTER_SQL}
      and ($6::text is null or li.quality = $6::text)
  ),
  norms as (
    select
      quality,
      count(*)                                                     as lines_in_quality,
      percentile_cont(0.25) within group (order by rate)            as p25,
      percentile_cont(0.50) within group (order by rate)            as median,
      percentile_cont(0.75) within group (order by rate)            as p75
    from rated group by quality
  )
  select
    r.*, nm.lines_in_quality, nm.median as quality_median, nm.p25, nm.p75,
    case when nm.lines_in_quality >= ${MIN_LINES_FOR_NORM}
              and r.rate < nm.p25 - 1.5 * (nm.p75 - nm.p25) then 'Below'
         when nm.lines_in_quality >= ${MIN_LINES_FOR_NORM}
              and r.rate > nm.p75 + 1.5 * (nm.p75 - nm.p25) then 'Above'
         else '' end                                               as outlier
  from rated r
  join norms nm on nm.quality = r.quality
  order by
    case when nm.lines_in_quality >= ${MIN_LINES_FOR_NORM} and nm.median > 0
         then abs(r.rate - nm.median) / nm.median else 0 end desc,
    r.line_total desc
`;

type Raw = {
  order_no: string; order_date: string; party_name: string | null; agent: string | null;
  sales_person: string | null; quality: string; design_no: string | null;
  qty_mtr: string; rate: string; line_total: string; lines_in_quality: number;
  quality_median: string; p25: string; p75: string; outlier: string;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [...orderFilterArgs(params), params.quality ?? null])) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const rate = n(r.rate);
    const median = n(r.quality_median);
    const gap = median > 0 ? rate - median : null;
    return {
      order_no: r.order_no,
      order_date: r.order_date?.slice(0, 10) ?? null,
      party_name: r.party_name,
      agent: r.agent,
      sales_person: r.sales_person,
      quality: r.quality,
      design_no: r.design_no,
      qty_mtr: n(r.qty_mtr),
      rate: money2(rate),
      quality_median: money2(median),
      gap: gap === null ? null : money2(gap),
      gap_pct: median > 0 ? Math.round(((rate - median) / median) * 1000) / 10 : null,
      // What the difference is worth on this line, which is the figure worth
      // acting on — a ₹20 gap on 50 metres is not a ₹20 gap on 5,000.
      value_effect: median > 0 ? money2((rate - median) * n(r.qty_mtr)) : null,
      outlier: r.outlier || "—",
      line_total: money2(r.line_total),
      lines_in_quality: n(r.lines_in_quality),
      has_norm: n(r.lines_in_quality) >= MIN_LINES_FOR_NORM,
    };
  });

  const withNorm = raw.filter((r) => n(r.lines_in_quality) >= MIN_LINES_FOR_NORM && n(r.quality_median) > 0);
  const below = withNorm.filter((r) => r.outlier === "Below");
  const above = withNorm.filter((r) => r.outlier === "Above");
  const belowCost = below.reduce((s, r) => s + (n(r.rate) - n(r.quality_median)) * n(r.qty_mtr), 0);
  const aboveGain = above.reduce((s, r) => s + (n(r.rate) - n(r.quality_median)) * n(r.qty_mtr), 0);
  const gaps = spread(withNorm.map((r) => ((n(r.rate) - n(r.quality_median)) / n(r.quality_median)) * 100));

  const byParty = new Map<string, number>();
  const byAgent = new Map<string, number>();
  for (const r of below) {
    const effect = (n(r.rate) - n(r.quality_median)) * n(r.qty_mtr);
    const p = r.party_name?.trim() || "Not recorded";
    const a = r.agent?.trim() || "No agent";
    byParty.set(p, (byParty.get(p) ?? 0) + Math.abs(effect));
    byAgent.set(a, (byAgent.get(a) ?? 0) + Math.abs(effect));
  }

  const insights: string[] = [];
  if (withNorm.length) {
    insights.push(
      `${count(below.length)} lines were sold below their own quality's normal range, ` +
        `worth ${inrShort(Math.abs(belowCost))} less than the middle rate for that cloth. ` +
        `${count(above.length)} were sold above it, worth ${inrShort(aboveGain)} more.`,
    );
  }
  if (below.length) {
    const worst = [...below].sort(
      (a, b) => (n(a.rate) - n(a.quality_median)) * n(a.qty_mtr) - (n(b.rate) - n(b.quality_median)) * n(b.qty_mtr),
    )[0];
    insights.push(
      `The single largest gap is order ${worst.order_no} — ${worst.quality} at ${inr(n(worst.rate))} against a normal ${inr(n(worst.quality_median))}, ` +
        `on ${count(n(worst.qty_mtr))} metres. That one line is ${inrShort(Math.abs((n(worst.rate) - n(worst.quality_median)) * n(worst.qty_mtr)))}.`,
    );
  }
  if (gaps.median !== null) {
    insights.push(
      `The middle line sells within ${pct(Math.abs(gaps.median))} of its quality's normal rate, and the middle half sits between ` +
        `${pct(gaps.p25 ?? 0)} and ${pct(gaps.p75 ?? 0)} of it — so most pricing is consistent and the flagged lines really are the exceptions.`,
    );
  }
  const noNorm = raw.length - withNorm.length;
  if (noNorm > 0) {
    insights.push(
      `${count(noNorm)} lines belong to qualities with fewer than ${MIN_LINES_FOR_NORM} lines, so they have no norm to be measured against and are not flagged.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      kpis: [
        { label: "Lines priced", value: count(raw.length) },
        { label: "With a norm", value: count(withNorm.length), sub: `${MIN_LINES_FOR_NORM}+ lines in the quality` },
        { label: "Sold below", value: count(below.length), tone: below.length ? "bad" : "good" },
        { label: "Worth", value: inrShort(Math.abs(belowCost)), tone: "bad", sub: "less than the norm" },
        { label: "Sold above", value: count(above.length), tone: "good" },
        { label: "Worth", value: inrShort(aboveGain), tone: "good", sub: "more than the norm" },
        { label: "Net", value: inrShort(aboveGain + belowCost), tone: aboveGain + belowCost < 0 ? "bad" : "good" },
        { label: "Typical variance", value: gaps.median !== null ? pct(Math.abs(gaps.median)) : "—", sub: "from the quality's middle" },
      ],
      panels: [
        { title: "Biggest gaps below the norm", valueLabel: "Effect", rows: rank(below.map((r) => ({ label: `${r.order_no} · ${r.quality}`, value: Math.abs((n(r.rate) - n(r.quality_median)) * n(r.qty_mtr)), meta: `${inr(n(r.rate))} vs ${inr(n(r.quality_median))}` })), inrShort) },
        { title: "Below-norm value by customer", valueLabel: "Effect", rows: rank([...byParty].map(([label, value]) => ({ label, value })), inrShort) },
        { title: "Below-norm value by agent", valueLabel: "Effect", rows: rank([...byAgent].map(([label, value]) => ({ label, value })), inrShort) },
        { title: "Sold above the norm", valueLabel: "Effect", rows: rank(above.map((r) => ({ label: `${r.order_no} · ${r.quality}`, value: (n(r.rate) - n(r.quality_median)) * n(r.qty_mtr) })), inrShort) },
      ],
      insights,
      caveats: [
        `A line is flagged when its rate sits outside 1.5 × the interquartile range of its own QUALITY — the standard boxplot fence. It is not a judgement, it is an invitation to look.`,
        `Qualities with fewer than ${MIN_LINES_FOR_NORM} lines get no norm and no flag. Three lines do not establish what a cloth normally sells for.`,
        "The norm is calculated over the PERIOD in this file. A narrower period gives a narrower norm and flags more lines.",
        CANCELLED_CAVEAT,
      ],
    },
  };
}

export const rateAnalysis: ReportDefinition = {
  id: "order-entry.rate-analysis",
  module: "order-entry",
  title: "Rate analysis",
  description:
    "Every line against its own quality's normal rate — how far above or below, what that gap is worth, and which lines fall outside the usual range.",
  defaultMonthsBack: 3,
  columns: [
    { key: "outlier", label: "Flag", type: "text", width: 10, note: "Below or Above its quality's usual range. A dash means within it." },
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 20 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "quality", label: "Quality", type: "text", width: 26 },
    { key: "design_no", label: "Design no", type: "text", width: 15 },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "rate", label: "Rate", type: "money" },
    { key: "quality_median", label: "Usual rate", type: "money", note: "The median rate for this quality over the period in this file." },
    { key: "gap", label: "Gap", type: "money", note: "Rate minus the usual rate. Negative means sold below." },
    { key: "gap_pct", label: "Gap %", type: "percent" },
    { key: "value_effect", label: "Worth", type: "money", note: "The gap multiplied by the metres — what the difference is actually worth on this line." },
    { key: "line_total", label: "Line value", type: "money" },
    { key: "lines_in_quality", label: "Lines in quality", type: "int" },
    { key: "has_norm", label: "Has a norm", type: "boolean" },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "quality", label: "Quality", kind: "select", options: () => distinctLineValues("quality") },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
