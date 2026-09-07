import "server-only";

import { sql as pg } from "@/db";
import { rank, spread } from "../analysis";
import { count, inrShort, pct } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { CANCELLED_CAVEAT, distinctLineValues, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Rate analysis — where cloth went out away from its own usual price
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THIS REPORT WAS WRONG, AND THIS IS WHAT WAS WRONG WITH IT ────────────
 *
 * The first version compared every line to the median rate of its QUALITY.
 * Measured against the live book, that flagged 240 lines — and only 95 of them
 * survive a comparison at the right grain. **183 of 240 were false alarms.**
 *
 * The cause is that a quality is not one product. LONDON has 209 designs and
 * sells between ₹80 and ₹190; Innova sells almost everything at ₹90 and one
 * design at ₹1,700. Comparing a line to its quality's median therefore flags
 * every line of a cheaper design in a quality that also sells dearer ones —
 * not a pricing problem, just a different design. A report whose findings are
 * three-quarters noise gets ignored after its first outing, which is worse
 * than not having it.
 *
 * ── THE NORM IS NOW THE FINEST GRAIN THAT HAS ENOUGH LINES ───────────────
 *
 * Quality AND design when that pair has at least five lines; otherwise the
 * quality, if IT has five; otherwise no norm and no flag. Measured over the
 * live book that gives 1,767 lines judged against their own design, 3,653
 * against their quality, and 160 left unjudged — which is the honest outcome
 * for cloth we have barely sold.
 *
 * Every row says WHICH grain judged it, so nobody has to guess how strong a
 * finding is.
 *
 * ── AND A MIS-PRICED ORDER IS ONE FINDING, NOT FORTY-FOUR ────────────────
 *
 * Order 805 alone produced 44 flagged lines. As a list of lines that is 44
 * things to look at; as an order it is one conversation. The dashboard leads
 * with the ORDER roll-up and the line detail sits behind it in the Data sheet,
 * which is the way round somebody actually works.
 *
 * ── RATES HAVE NOT DRIFTED, SO NO TIME ADJUSTMENT IS MADE ────────────────
 *
 * Checked before deciding: the median rate by month runs 155, 179, 168, 165,
 * 174 across the book. There is no trend to correct for, so the norm is a flat
 * median over the period rather than something rolling. If that ever changes
 * this is the assumption to revisit.
 */

const MIN_LINES = 5;

const SQL = `
  with rated as (
    select
      li.id, o.id as order_id, o.order_no, o.order_date, o.party_name, o.agent, o.sales_person,
      coalesce(nullif(trim(li.quality), ''), 'Not recorded')   as quality,
      coalesce(nullif(trim(li.design_no), ''), 'Not recorded') as design_no,
      li.qty_mtr, li.rate, li.line_total
    from ld_order_entry.order_line_items li
    join ld_order_entry.customer_orders o on o.id = li.order_id
    where not li.is_deleted and not li.is_cancelled and li.rate > 0
      and ($1::date is null or o.order_date >= $1::date)
      and ($2::date is null or o.order_date <= $2::date)
      ${ORDER_FILTER_SQL}
      and ($6::text is null or li.quality = $6::text)
  ),
  by_design as (
    select quality, design_no, count(*) n,
           percentile_cont(0.25) within group (order by rate) p25,
           percentile_cont(0.50) within group (order by rate) med,
           percentile_cont(0.75) within group (order by rate) p75
      from rated group by 1, 2
  ),
  by_quality as (
    select quality, count(*) n,
           percentile_cont(0.25) within group (order by rate) p25,
           percentile_cont(0.50) within group (order by rate) med,
           percentile_cont(0.75) within group (order by rate) p75
      from rated group by 1
  ),
  judged as (
    select
      r.*,
      case when d.n >= ${MIN_LINES} then 'This design'
           when q.n >= ${MIN_LINES} then 'The quality'
           else 'Too few sales' end                       as compared_with,
      case when d.n >= ${MIN_LINES} then d.med  when q.n >= ${MIN_LINES} then q.med  end as usual,
      case when d.n >= ${MIN_LINES} then d.p25  when q.n >= ${MIN_LINES} then q.p25  end as p25,
      case when d.n >= ${MIN_LINES} then d.p75  when q.n >= ${MIN_LINES} then q.p75  end as p75,
      case when d.n >= ${MIN_LINES} then d.n    when q.n >= ${MIN_LINES} then q.n    end as sample
    from rated r
    join by_design  d on d.quality = r.quality and d.design_no = r.design_no
    join by_quality q on q.quality = r.quality
  )
  select
    j.*,
    case when j.usual is null then ''
         when j.rate < j.p25 - 1.5 * (j.p75 - j.p25) then 'Below usual'
         when j.rate > j.p75 + 1.5 * (j.p75 - j.p25) then 'Above usual'
         else '' end as flag
  from judged j
  order by
    case when j.usual > 0 then abs(j.rate - j.usual) * j.qty_mtr else 0 end desc,
    j.line_total desc
`;

type Raw = {
  id: string; order_id: string; order_no: string; order_date: string;
  party_name: string | null; agent: string | null; sales_person: string | null;
  quality: string; design_no: string; qty_mtr: string; rate: string; line_total: string;
  compared_with: string; usual: string | null; p25: string | null; p75: string | null;
  sample: number | null; flag: string;
};

/** What the difference is actually worth on this line. */
const effectOf = (r: Raw) => (r.usual === null ? 0 : (n(r.rate) - n(r.usual)) * n(r.qty_mtr));

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [...orderFilterArgs(params), params.quality ?? null])) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const usual = r.usual === null ? null : n(r.usual);
    return {
      flag: r.flag || "—",
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
      // Blank, not zero, where there is no norm — a gap of 0.00 against
      // nothing reads as "priced exactly right", which is the opposite of
      // "we have no idea".
      gap: usual === null ? null : money2(n(r.rate) - usual),
      gap_pct: usual && usual > 0 ? Math.round(((n(r.rate) - usual) / usual) * 1000) / 10 : null,
      value_effect: usual === null ? null : money2(effectOf(r)),
      compared_with: r.compared_with,
      sample: r.sample,
      line_total: money2(r.line_total),
    };
  });

  const judged = raw.filter((r) => r.usual !== null);
  const below = judged.filter((r) => r.flag === "Below usual");
  const above = judged.filter((r) => r.flag === "Above usual");
  const belowValue = Math.abs(below.reduce((s, r) => s + effectOf(r), 0));
  const aboveValue = above.reduce((s, r) => s + effectOf(r), 0);
  const byDesign = judged.filter((r) => r.compared_with === "This design");
  const unjudged = raw.filter((r) => r.usual === null);

  // ── the order roll-up: one finding per order, not per line ──────────────
  const orders = new Map<string, { order: string; party: string; lines: number; effect: number; date: string }>();
  for (const r of [...below, ...above]) {
    const cur = orders.get(r.order_no) ?? {
      order: r.order_no,
      party: r.party_name ?? "Not recorded",
      lines: 0,
      effect: 0,
      date: r.order_date?.slice(0, 10) ?? "",
    };
    cur.lines += 1;
    cur.effect += effectOf(r);
    orders.set(r.order_no, cur);
  }
  const orderList = [...orders.values()].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  const byParty = new Map<string, number>();
  const byAgent = new Map<string, number>();
  for (const r of below) {
    const e = Math.abs(effectOf(r));
    byParty.set(r.party_name?.trim() || "Not recorded", (byParty.get(r.party_name?.trim() || "Not recorded") ?? 0) + e);
    byAgent.set(r.agent?.trim() || "No agent", (byAgent.get(r.agent?.trim() || "No agent") ?? 0) + e);
  }

  const gaps = spread(judged.filter((r) => n(r.usual) > 0).map((r) => ((n(r.rate) - n(r.usual)) / n(r.usual)) * 100));

  const headline =
    orderList.length > 0
      ? `${count(orderList.length)} orders were priced away from what that cloth usually sells for. ` +
        `The cheap ones cost ${inrShort(belowValue)}; the dear ones brought in ${inrShort(aboveValue)} extra.`
      : "Every line in this period was priced within the usual range for its cloth.";

  const insights: string[] = [];
  insights.push(
    `Each line is compared with the same DESIGN where we have sold it at least ${MIN_LINES} times ` +
      `(${count(byDesign.length)} lines), and otherwise with the whole quality (${count(judged.length - byDesign.length)}). ` +
      `${count(unjudged.length)} lines are of cloth we have barely sold, so they are left unjudged rather than guessed at.`,
  );
  if (below.length) {
    const worst = orderList.filter((o) => o.effect < 0)[0];
    if (worst) {
      insights.push(
        `The largest single case is order ${worst.order} for ${worst.party} — ${count(worst.lines)} line${worst.lines === 1 ? "" : "s"} ` +
          `priced ${inrShort(Math.abs(worst.effect))} below the usual rate. That is one conversation, not ${count(worst.lines)}.`,
      );
    }
  }
  if (gaps.median !== null && gaps.p25 !== null && gaps.p75 !== null) {
    insights.push(
      `Most pricing is tight: the middle line sits within ${pct(Math.abs(gaps.median))} of the usual rate, and half of all lines ` +
        `fall between ${pct(gaps.p25)} and ${pct(gaps.p75)} of it. The flagged ones really are the exceptions.`,
    );
  }
  if (above.length) {
    insights.push(
      `${count(above.length)} lines went out ABOVE the usual rate, worth ${inrShort(aboveValue)} more. ` +
        `Worth knowing which customers accept it as much as which get a discount.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline,
      kpis: [
        { label: "Lines priced", value: count(raw.length) },
        { label: "Judged", value: count(judged.length), sub: `${count(byDesign.length)} against their own design`, tone: "good" },
        { label: "Sold cheap", value: count(below.length), tone: below.length ? "bad" : "good", sub: `${count(orderList.filter((o) => o.effect < 0).length)} orders` },
        { label: "What that cost", value: inrShort(belowValue), tone: "bad" },
        { label: "Sold dear", value: count(above.length), tone: "good" },
        { label: "What that gained", value: inrShort(aboveValue), tone: "good" },
        {
          label: "Normal spread",
          value:
            gaps.p25 !== null && gaps.p75 !== null
              ? `${gaps.p25 >= 0 ? "+" : ""}${gaps.p25.toFixed(1)}% to ${gaps.p75 >= 0 ? "+" : ""}${gaps.p75.toFixed(1)}%`
              : "—",
          sub: "where half of all lines sit",
        },
        { label: "Not judged", value: count(unjudged.length), tone: "warn", sub: `fewer than ${MIN_LINES} sales` },
      ],
      panels: [
        {
          title: "Orders priced furthest from usual",
          valueLabel: "Effect",
          kind: "split",
          rows: orderList.slice(0, 8).map((o) => ({
            label: `${o.order} · ${o.party.slice(0, 22)}`,
            value: o.effect,
            display: inrShort(Math.abs(o.effect)),
            meta: `${o.lines} line${o.lines === 1 ? "" : "s"}`,
          })),
          note: "Green sold above the usual rate, red below. One row per order, so a mis-priced order is one thing to look at.",
        },
        {
          title: "How much was judged, and against what",
          valueLabel: "Lines",
          kind: "share",
          rows: [
            { label: "Against its own design", value: byDesign.length, display: count(byDesign.length) },
            { label: "Against its quality", value: judged.length - byDesign.length, display: count(judged.length - byDesign.length) },
            { label: "Too few sales to judge", value: unjudged.length, display: count(unjudged.length) },
          ],
          note: "A finding judged against its own design is the stronger one.",
        },
        {
          title: "Cheap selling, by customer",
          valueLabel: "Effect",
          rows: rank([...byParty].map(([label, value]) => ({ label, value })), inrShort),
          note: "What the discount was worth, added up per customer.",
        },
        {
          title: "Cheap selling, by agent",
          valueLabel: "Effect",
          rows: rank([...byAgent].map(([label, value]) => ({ label, value })), inrShort),
        },
      ],
      insights,
      caveats: [
        `A line is compared with the same QUALITY AND DESIGN when we have sold that pair at least ${MIN_LINES} times, and with the quality alone otherwise. Cloth with fewer than ${MIN_LINES} sales is not judged at all — the “Compared with” column says which applied to each row.`,
        "“Flagged” means the rate sits outside the usual range for that cloth by the standard statistical measure. It is an invitation to look, not a verdict — a deliberate discount to a large customer looks exactly the same as a mistake.",
        "The usual rate is worked out from the PERIOD in this file. A narrower period means a narrower norm and more lines flagged.",
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
    "Where cloth went out cheaper or dearer than it usually does — compared design by design, with what the difference was worth and which orders it happened on.",
  defaultMonthsBack: 3,
  columns: [
    { key: "flag", label: "Flag", type: "text", width: 13, note: "Below or above the usual range for this cloth. A dash means normal." },
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 20 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "quality", label: "Quality", type: "text", width: 26 },
    { key: "design_no", label: "Design no", type: "text", width: 15 },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "rate", label: "Rate", type: "money" },
    { key: "usual_rate", label: "Usual rate", type: "money", note: "What this cloth normally sells for. Blank when we have not sold it enough times to say." },
    { key: "compared_with", label: "Compared with", type: "text", width: 16, note: "Whether the usual rate came from this design's own sales or from the whole quality." },
    { key: "sample", label: "Sales compared", type: "int", note: "How many past lines the usual rate is based on. More is stronger." },
    { key: "gap", label: "Gap", type: "money", note: "Rate minus usual. Negative means sold cheaper." },
    { key: "gap_pct", label: "Gap %", type: "percent" },
    { key: "value_effect", label: "Worth", type: "money", note: "The gap multiplied by the metres — what the difference is actually worth on this line." },
    { key: "line_total", label: "Line value", type: "money" },
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
