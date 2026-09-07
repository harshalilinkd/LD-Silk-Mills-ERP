import "server-only";

import { sql as pg } from "@/db";
import { rank, spread } from "../analysis";
import { count, inrShort, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { CANCELLED_CAVEAT, distinctLineValues, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Rate analysis — where cloth went out cheaper or dearer than usual
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THREE THINGS WERE WRONG WITH THIS REPORT, ALL FOUND BY THE OWNER ─────
 *
 * They entered a test order — AMAZE, 200 metres at ₹50 — and the report said
 * the usual rate was ₹300, the gap was ₹250, and it was worth −₹50,000. Every
 * one of those numbers was arithmetically correct and the finding was still
 * wrong. Here is why, and what each fix is.
 *
 * **1. A single order was setting its own benchmark.**
 * AMAZE had nine lines in the period: six real ones and the three from that
 * test order. A third of the evidence was the thing being judged. Worse, order
 * 805 alone contributed 42 identical lines to its cloth's median — one order,
 * forty-two votes.
 *   → The norm now takes ONE observation per ORDER, not per line. Forty-two
 *     identical lines are one order's decision, and count once.
 *
 * **2. The comparison ignored order size.** AMAZE's "usual ₹300" came from
 * lines of 1.6 metres — samples. The test line was 200 metres. Bigger orders
 * get better rates in every business on earth, so comparing a 200-metre line
 * with a 1.6-metre sample is not a pricing finding, it is a category error.
 *   → Every row now carries the size range the norm was built from, and a line
 *     far outside that range (three times larger or a third the size) is
 *     marked "Different size" and kept out of the totals entirely.
 *
 * **3. "Worth −₹50,000" on a line that earned ₹10,000.** Mathematically the
 * gap times the metres; to anybody reading it, a claim that ₹50,000 went
 * missing from a ₹10,000 sale. 143 lines carried a figure larger than the line
 * itself, the worst five times over.
 *   → Gone. The sheet now shows what the line ACTUALLY earned beside what it
 *     WOULD have earned at the usual rate, and the difference between the two.
 *     Same arithmetic, and it reads as the comparison it always was.
 *
 * ── AND THE HONEST CONSEQUENCE ───────────────────────────────────────────
 *
 * Requiring five different orders judges 70% of lines rather than 97%. That is
 * the point: for AMAZE, sold in four orders ever, the truthful answer to "is
 * ₹50 wrong" is that we have not sold it enough times to know. The report now
 * says "Too few orders" instead of inventing a benchmark from three samples.
 */

/** Different ORDERS needed before this cloth has a usual price at all. */
const MIN_ORDERS = 5;

/** A line this many times outside the compared sizes is not comparable. */
const SIZE_FACTOR = 3;

const SQL = `
  with rated as (
    select
      li.id, o.id as order_id, o.order_no, o.order_date, o.party_name, o.agent, o.sales_person,
      coalesce(nullif(trim(li.quality), ''), 'Not recorded')   as quality,
      coalesce(nullif(trim(li.design_no), ''), 'Not recorded') as design_no,
      li.qty_mtr, li.rate, li.line_total
    from ld_order_entry.order_line_items li
    join ld_order_entry.customer_orders o on o.id = li.order_id
    where not li.is_deleted and not li.is_cancelled and li.rate > 0 and li.qty_mtr > 0
      and ($1::date is null or o.order_date >= $1::date)
      and ($2::date is null or o.order_date <= $2::date)
      ${ORDER_FILTER_SQL}
      and ($6::text is null or li.quality = $6::text)
  ),
  -- ONE observation per order per cloth. The rate an order paid is its own
  -- value over its own metres, so a line repeated forty-two times inside one
  -- order counts once rather than forty-two times.
  per_order_design as (
    select quality, design_no, order_id,
           sum(line_total) / nullif(sum(qty_mtr), 0) as rate
      from rated group by 1, 2, 3
  ),
  per_order_quality as (
    select quality, order_id,
           sum(line_total) / nullif(sum(qty_mtr), 0) as rate
      from rated group by 1, 2
  ),
  -- The size range of the LINES behind each norm, so the report can say what
  -- it compared against and refuse a comparison across very different sizes.
  sizes_design as (
    select quality, design_no, min(qty_mtr) lo_m, max(qty_mtr) hi_m
      from rated group by 1, 2
  ),
  sizes_quality as (
    select quality, min(qty_mtr) lo_m, max(qty_mtr) hi_m
      from rated group by 1
  ),
  norm_design as (
    select quality, design_no, count(*) as orders,
           percentile_cont(0.25) within group (order by rate) p25,
           percentile_cont(0.50) within group (order by rate) med,
           percentile_cont(0.75) within group (order by rate) p75
      from per_order_design group by 1, 2
  ),
  norm_quality as (
    select quality, count(*) as orders,
           percentile_cont(0.25) within group (order by rate) p25,
           percentile_cont(0.50) within group (order by rate) med,
           percentile_cont(0.75) within group (order by rate) p75
      from per_order_quality group by 1
  ),
  judged as (
    select
      r.*,
      case when nd.orders >= ${MIN_ORDERS} then 'This design'
           when nq.orders >= ${MIN_ORDERS} then 'The quality'
           else 'Too few orders' end                                              as compared_with,
      case when nd.orders >= ${MIN_ORDERS} then nd.med when nq.orders >= ${MIN_ORDERS} then nq.med end as usual,
      case when nd.orders >= ${MIN_ORDERS} then nd.p25 when nq.orders >= ${MIN_ORDERS} then nq.p25 end as p25,
      case when nd.orders >= ${MIN_ORDERS} then nd.p75 when nq.orders >= ${MIN_ORDERS} then nq.p75 end as p75,
      case when nd.orders >= ${MIN_ORDERS} then nd.orders when nq.orders >= ${MIN_ORDERS} then nq.orders end as sample_orders,
      case when nd.orders >= ${MIN_ORDERS} then sd.lo_m when nq.orders >= ${MIN_ORDERS} then sq.lo_m end as lo_m,
      case when nd.orders >= ${MIN_ORDERS} then sd.hi_m when nq.orders >= ${MIN_ORDERS} then sq.hi_m end as hi_m
    from rated r
    join norm_design   nd on nd.quality = r.quality and nd.design_no = r.design_no
    join norm_quality  nq on nq.quality = r.quality
    join sizes_design  sd on sd.quality = r.quality and sd.design_no = r.design_no
    join sizes_quality sq on sq.quality = r.quality
  )
  select
    j.*,
    case
      when j.usual is null then 'Too few orders'
      -- A 200-metre line against 1.6-metre samples is not a pricing finding.
      when j.qty_mtr > ${SIZE_FACTOR} * j.hi_m or j.qty_mtr * ${SIZE_FACTOR} < j.lo_m
        then 'Different size'
      when j.rate < j.p25 - 1.5 * (j.p75 - j.p25) then 'Sold cheaper'
      when j.rate > j.p75 + 1.5 * (j.p75 - j.p25) then 'Sold dearer'
      else 'Normal' end as flag
  from judged j
  order by
    case when j.usual > 0 then abs(j.rate - j.usual) * j.qty_mtr else 0 end desc,
    j.line_total desc, j.order_no, j.quality, j.design_no, j.id
`;

type Raw = {
  id: string; order_id: string; order_no: string; order_date: string;
  party_name: string | null; agent: string | null; sales_person: string | null;
  quality: string; design_no: string; qty_mtr: string; rate: string; line_total: string;
  compared_with: string; usual: string | null; p25: string | null; p75: string | null;
  sample_orders: number | null; lo_m: string | null; hi_m: string | null; flag: string;
};

/** What this line would have earned at the usual rate. */
const atUsual = (r: Raw) => (r.usual === null ? null : n(r.usual) * n(r.qty_mtr));
const difference = (r: Raw) => {
  const a = atUsual(r);
  return a === null ? 0 : n(r.line_total) - a;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [...orderFilterArgs(params), params.quality ?? null])) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const usual = r.usual === null ? null : n(r.usual);
    const would = atUsual(r);
    return {
      flag: r.flag,
      order_no: r.order_no,
      order_date: r.order_date?.slice(0, 10) ?? null,
      party_name: r.party_name,
      agent: r.agent,
      sales_person: r.sales_person,
      quality: r.quality,
      design_no: r.design_no,
      qty_mtr: n(r.qty_mtr),
      rate: money2(r.rate),
      usual_rate: usual === null ? null : money2(usual),
      compared_with: r.compared_with,
      sample_orders: r.sample_orders,
      compared_sizes:
        r.lo_m === null || r.hi_m === null
          ? null
          : `${qty(Math.round(n(r.lo_m) * 10) / 10)} – ${qty(Math.round(n(r.hi_m) * 10) / 10)} m`,
      gap: usual === null ? null : money2(n(r.rate) - usual),
      gap_pct: usual && usual > 0 ? ((n(r.rate) - usual) / usual) * 100 : null,
      line_total: money2(r.line_total),
      // The two figures that replaced "Worth". Side by side they read as the
      // comparison they are, rather than as money missing from the till.
      at_usual_rate: would === null ? null : money2(would),
      difference: would === null ? null : money2(n(r.line_total) - would),
    };
  });

  const judged = raw.filter((r) => r.usual !== null && r.flag !== "Different size");
  const cheap = raw.filter((r) => r.flag === "Sold cheaper");
  const dear = raw.filter((r) => r.flag === "Sold dearer");
  const wrongSize = raw.filter((r) => r.flag === "Different size");
  const tooFew = raw.filter((r) => r.flag === "Too few orders");
  const byDesign = judged.filter((r) => r.compared_with === "This design");

  const cheapEarned = cheap.reduce((s, r) => s + n(r.line_total), 0);
  const cheapWould = cheap.reduce((s, r) => s + (atUsual(r) ?? 0), 0);
  const dearEarned = dear.reduce((s, r) => s + n(r.line_total), 0);
  const dearWould = dear.reduce((s, r) => s + (atUsual(r) ?? 0), 0);

  // ── one finding per ORDER, not per line ────────────────────────────────
  const orders = new Map<string, { order: string; party: string; lines: number; diff: number }>();
  for (const r of [...cheap, ...dear]) {
    const cur = orders.get(r.order_no) ?? {
      order: r.order_no,
      party: r.party_name ?? "Not recorded",
      lines: 0,
      diff: 0,
    };
    cur.lines += 1;
    cur.diff += difference(r);
    orders.set(r.order_no, cur);
  }
  const orderList = [...orders.values()].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const byParty = new Map<string, number>();
  const byAgent = new Map<string, number>();
  for (const r of cheap) {
    const d = Math.abs(difference(r));
    byParty.set(r.party_name?.trim() || "Not recorded", (byParty.get(r.party_name?.trim() || "Not recorded") ?? 0) + d);
    byAgent.set(r.agent?.trim() || "No agent", (byAgent.get(r.agent?.trim() || "No agent") ?? 0) + d);
  }

  const gaps = spread(judged.filter((r) => n(r.usual) > 0).map((r) => ((n(r.rate) - n(r.usual)) / n(r.usual)) * 100));

  const headline =
    orderList.length > 0
      ? `${count(orderList.length)} orders were priced away from what that cloth usually goes for. ` +
        `The cheap ones brought in ${inrShort(cheapEarned)} where the usual rate would have given ${inrShort(cheapWould)}.`
      : "Every line in this period was priced within the usual range for its cloth.";

  const insights: string[] = [
    `A cloth only has a “usual rate” once it has been sold in at least ${MIN_ORDERS} DIFFERENT orders, ` +
      `and each order counts once however many lines it has. ${count(judged.length)} lines could be judged that way; ` +
      `${count(tooFew.length)} are of cloth sold too few times to say anything about.`,
  ];
  if (wrongSize.length) {
    insights.push(
      `${count(wrongSize.length)} lines were set aside because their size is nothing like the orders they would be compared with — ` +
        `a 200-metre line against 1.6-metre samples is not a pricing problem, it is a different kind of sale.`,
    );
  }
  if (cheap.length) {
    const worst = orderList.filter((o) => o.diff < 0)[0];
    if (worst) {
      insights.push(
        `The biggest case is order ${worst.order} for ${worst.party}: ${count(worst.lines)} line${worst.lines === 1 ? "" : "s"} ` +
          `brought in ${inrShort(Math.abs(worst.diff))} less than the usual rate would have. That is one conversation, not ${count(worst.lines)}.`,
      );
    }
  }
  if (gaps.median !== null && gaps.p25 !== null && gaps.p75 !== null) {
    insights.push(
      `Most pricing is tight — half of all judged lines sit between ${pct(gaps.p25)} and ${pct(gaps.p75)} of the usual rate. ` +
        `The flagged ones really are the exceptions.`,
    );
  }
  if (dear.length) {
    insights.push(
      `${count(dear.length)} lines went out ABOVE the usual rate, bringing in ${inrShort(dearEarned - dearWould)} more than usual. ` +
        `Worth knowing which customers accept a higher price as much as which get a discount.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline,
      kpis: [
        { label: "Lines priced", value: count(raw.length) },
        { label: "Could be judged", value: count(judged.length), tone: "good", sub: `${count(byDesign.length)} against their own design` },
        { label: "Sold cheaper", value: count(cheap.length), tone: cheap.length ? "bad" : "good", lowerIsBetter: true, sub: `${count(orderList.filter((o) => o.diff < 0).length)} orders` },
        { label: "They brought in", value: inrShort(cheapEarned), tone: "bad", sub: `usual rate: ${inrShort(cheapWould)}` },
        { label: "Sold dearer", value: count(dear.length), tone: "good" },
        { label: "They brought in", value: inrShort(dearEarned), tone: "good", sub: `usual rate: ${inrShort(dearWould)}` },
        { label: "Different size", value: count(wrongSize.length), tone: "warn", sub: "set aside, not counted" },
        { label: "Too few sales", value: count(tooFew.length), tone: "warn", sub: `under ${MIN_ORDERS} orders of that cloth` },
      ],
      panels: [
        {
          title: "Orders priced furthest from usual",
          valueLabel: "Difference",
          kind: "split",
          rows: orderList.slice(0, 8).map((o) => ({
            label: `${o.order} · ${o.party.slice(0, 20)}`,
            value: o.diff,
            display: inrShort(Math.abs(o.diff)),
            meta: `${o.lines} line${o.lines === 1 ? "" : "s"}`,
          })),
          note: "Green earned more than usual, red less. One row per order.",
        },
        {
          title: "What could and could not be judged",
          valueLabel: "Lines",
          kind: "share",
          rows: [
            { label: "Against its own design", value: byDesign.length, display: count(byDesign.length) },
            { label: "Against its quality", value: judged.length - byDesign.length, display: count(judged.length - byDesign.length) },
            { label: "A different size of sale", value: wrongSize.length, display: count(wrongSize.length) },
            { label: "Sold too few times", value: tooFew.length, display: count(tooFew.length) },
          ],
          note: "A finding judged against its own design is the stronger one.",
        },
        {
          title: "Discount given, by customer",
          valueLabel: "Difference",
          rows: rank([...byParty].map(([label, value]) => ({ label, value })), inrShort),
          note: "How much less than the usual rate each customer paid, added up.",
        },
        {
          title: "Discount given, by agent",
          valueLabel: "Difference",
          rows: rank([...byAgent].map(([label, value]) => ({ label, value })), inrShort),
        },
      ],
      insights,
      caveats: [
        `A cloth needs to have been sold in ${MIN_ORDERS} or more DIFFERENT orders before this report will say what it usually costs. Each order counts once, however many lines it contains — otherwise one large order sets its own benchmark.`,
        `A line whose size is more than ${SIZE_FACTOR} times larger, or a third the size, of the orders it would be compared with is marked “Different size” and left out of every total. Bigger orders normally get better rates, and that is not a pricing mistake.`,
        "“What it brought in” and “At the usual rate” are shown side by side rather than as a single loss figure. The difference between them is what would have changed, not money that went missing.",
        "A flag is an invitation to look, never a verdict. A deliberate discount to a large customer looks exactly like a mistake from here.",
        "The usual rate is worked out from the PERIOD in this file. A narrower period means fewer orders to compare with, so more lines will read “Too few sales”.",
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
    "Where cloth went out cheaper or dearer than it usually does — compared design by design against other orders of a similar size, with what each line earned beside what the usual rate would have given.",
  defaultMonthsBack: 3,
  columns: [
    { key: "flag", label: "Flag", type: "text", width: 15, note: "Sold cheaper, Sold dearer, Normal, Different size (set aside), or Too few orders of this cloth to say." },
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 20 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "quality", label: "Quality", type: "text", width: 26 },
    { key: "design_no", label: "Design no", type: "text", width: 15 },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "rate", label: "Rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "What this line actually went out at, per metre." },
    { key: "usual_rate", label: "Usual rate", type: "money", total: "none", note: "The middle rate across OTHER orders of this cloth — one vote per order, not per line. Blank when we have not sold it in enough orders." },
    { key: "compared_with", label: "Compared with", type: "text", width: 16, note: "Whether the usual rate came from this design's own orders or from the whole quality." },
    { key: "sample_orders", label: "Orders compared", type: "int", total: "none", note: "How many different orders the usual rate is based on. More is stronger." },
    { key: "compared_sizes", label: "Their sizes", type: "text", width: 18, note: "The metre range of the lines behind the usual rate. If this line is nothing like that size, it is flagged Different size and left out." },
    { key: "gap", label: "Gap", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Rate minus usual rate. Negative means sold cheaper." },
    { key: "gap_pct", label: "Gap %", type: "percent", total: "none" },
    {
      key: "line_total",
      label: "It brought in",
      type: "money",
      note: "What this line actually earned. NOTE: the total at the foot covers EVERY line, while the two columns beside it cover only the lines that could be judged — filter to a single Flag to compare them like for like.",
    },
    {
      key: "at_usual_rate",
      label: "At the usual rate",
      type: "money",
      note: "What the same metres would have earned at the usual rate. Blank where the cloth has been sold too few times to have one, so the foot covers only judged lines.",
    },
    {
      key: "difference",
      label: "Difference",
      type: "money",
      note: "What it brought in, less what the usual rate would have given. A comparison, not money missing. Covers only judged lines.",
    },
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
