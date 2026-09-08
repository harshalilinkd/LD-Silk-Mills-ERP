import "server-only";

import { sql as pg } from "@/db";
import { concentration, concentrationInsight, rank, spread } from "../analysis";
import { count, inrShort, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import {
  BACKDATED_CAVEAT,
  distinctReasons,
  distinctReturnValues,
  distinctStatuses,
  filterArgs,
  money2,
  n,
  noValueCaveat,
  RETURN_FILTER_SQL,
} from "./shared";

/**
 * Party analysis — one row per customer who has sent cloth back.
 *
 * ── WHAT THIS REPORT DELIBERATELY DOES NOT DO ────────────────────────────
 *
 * The obvious best column here is "how much of what they BOUGHT came back" —
 * ₹4 lakh returned is nothing against ₹2 crore bought and everything against
 * ₹8 lakh. It was built, and then removed, because the data cannot support it
 * honestly:
 *
 *   · The two systems keep separate party tables with no shared id, so the
 *     only join is on the name. It matched 22 of 212 parties.
 *   · Their histories barely overlap. Returns go back to June 2024; the Orders
 *     database holds from May 2026. For most parties the "bought" side of the
 *     comparison is a period Orders knows nothing about.
 *
 * Over that sample the figure came out at "the middle party returns 50.6% of
 * what they bought", which is not true of this business and is exactly the
 * kind of number that gets quoted in a meeting and then has to be withdrawn.
 * A report going to the MD is better with an honest gap in it than with a
 * confident wrong answer, so the column is not offered at all.
 *
 * Bring it back the day the two systems share a customer id, or once Orders
 * holds as much history as Goods Return does.
 */
const SQL = `
  with returned as (
    select
      p.name                                  as party,
      count(distinct r.id)                    as returns,
      count(distinct r.id) filter (where r.status::text = 'received') as received,
      coalesce(sum(r.total_value), 0)         as value,
      count(*) filter (where r.total_value is null or r.total_value = 0) as no_value,
      coalesce(sum(r.transport_value), 0)
        + coalesce(sum(r.other_charges), 0)
        + coalesce(sum(r.bhiwandi_transport_value), 0)
        + coalesce(sum(r.bhiwandi_charges), 0)  as cost,
      min(r.dated)                            as first_return,
      max(r.dated)                            as last_return,
      ((now() at time zone 'Asia/Kolkata')::date - max(r.dated))           as days_since_last,
      max(b.name)                             as a_broker,
      count(distinct b.name)                  as brokers,
      count(distinct r.return_reason)         as reasons,
      mode() within group (order by r.return_reason) as top_reason
    from goods_return.returns r
    left join goods_return.parties p    on p.id = r.party_id
    left join goods_return.brokers b    on b.id = r.broker_id
    left join goods_return.transports t on t.id = r.transport_id
    where ($1::date is null or r.dated >= $1::date)
      and ($2::date is null or r.dated <= $2::date)
      ${RETURN_FILTER_SQL}
    group by p.name
  ),
  items as (
    select p.name as party,
           count(i.id)                     as items,
           coalesce(sum(i.quantity), 0)    as qty,
           coalesce(sum(i.pieces), 0)      as pieces,
           count(distinct i.quality_id)    as qualities,
           mode() within group (order by i.quality_name) as top_quality
    from goods_return.return_items i
    join goods_return.returns r         on r.id = i.return_id
    left join goods_return.parties p    on p.id = r.party_id
    left join goods_return.brokers b    on b.id = r.broker_id
    left join goods_return.transports t on t.id = r.transport_id
    where ($1::date is null or r.dated >= $1::date)
      and ($2::date is null or r.dated <= $2::date)
      ${RETURN_FILTER_SQL}
    group by p.name
  )
  select
    r.*,
    coalesce(i.items, 0)      as items,
    coalesce(i.qty, 0)        as qty,
    coalesce(i.pieces, 0)     as pieces,
    coalesce(i.qualities, 0)  as qualities,
    i.top_quality
  from returned r
  left join items i on i.party = r.party
  -- Value, then returns, then the name — the name is the tiebreak that makes
  -- two runs of the same period produce the same file.
  order by r.value desc, r.returns desc, r.party
`;

type Raw = {
  party: string | null; returns: number; received: number; value: string; no_value: number;
  cost: string; first_return: string; last_return: string; days_since_last: number;
  a_broker: string | null; brokers: number; reasons: number; top_reason: string | null;
  items: number; qty: string; pieces: number; qualities: number; top_quality: string | null;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, filterArgs(params))) as unknown as Raw[];
  const total = raw.reduce((s, r) => s + n(r.value), 0);

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
    party: r.party,
    returns: n(r.returns),
    received: n(r.received),
    still_out: n(r.returns) - n(r.received),
    items: n(r.items),
    qualities: n(r.qualities),
    qty: n(r.qty),
    pieces: n(r.pieces),
    value: money2(r.value),
    share: total > 0 ? (n(r.value) / total) * 100 : null,
    // Divided by the returns that HAVE a value, not by all of them. The
    // value-less ones are excluded from the numerator by the caveat on this
    // very sheet, so counting them in the denominator halved the average for
    // any party that had one.
    avg_return:
      n(r.returns) - n(r.no_value) > 0
        ? money2(n(r.value) / (n(r.returns) - n(r.no_value)))
        : null,
    no_value: n(r.no_value),
    cost: money2(r.cost),
    cost_share: n(r.value) > 0 ? (n(r.cost) / n(r.value)) * 100 : null,
    top_reason: r.top_reason,
    reasons: n(r.reasons),
    top_quality: r.top_quality,
    a_broker: r.a_broker,
    brokers: n(r.brokers),
    first_return: r.first_return?.slice(0, 10) ?? null,
    last_return: r.last_return?.slice(0, 10) ?? null,
    days_since_last: n(r.days_since_last),
  }));

  const totalReturns = raw.reduce((s, r) => s + n(r.returns), 0);
  const noValueTotal = raw.reduce((s, r) => s + n(r.no_value), 0);
  const conc = concentration(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.value) })));
  const repeat = raw.filter((r) => n(r.returns) > 1);
  const totalCost = raw.reduce((s, r) => s + n(r.cost), 0);
  const totalQty = raw.reduce((s, r) => s + n(r.qty), 0);
  const sizes = spread(raw.map((r) => n(r.value)).filter((x) => x > 0));
  const stillOut = raw.reduce((s, r) => s + n(r.returns) - n(r.received), 0);
  // Parties still sending things back. Counted to today, so it answers "is
  // this still happening", which is a question about now.
  const recent = raw.filter((r) => n(r.days_since_last) <= 90);

  const insights: string[] = [];
  const ci = concentrationInsight(conc, "parties");
  if (ci) insights.push(ci);
  if (raw.length) {
    insights.push(
      `${count(repeat.length)} of ${count(raw.length)} parties have sent cloth back more than once — ${pct((repeat.length / raw.length) * 100, 0)} of them.`,
    );
  }
  if (sizes.n > 0 && sizes.median !== null) {
    insights.push(
      `The middle party has sent back ${inrShort(sizes.median)} in all; the range runs ${inrShort(sizes.min ?? 0)} to ${inrShort(sizes.max ?? 0)}.`,
    );
  }
  if (recent.length) {
    insights.push(
      `${count(recent.length)} of ${count(raw.length)} parties have sent something back in the last 90 days — those are the ones still worth a conversation.`,
    );
  }
  if (stillOut) {
    insights.push(
      `${count(stillOut)} returns are still on their way to Bhiwandi, spread across ${count(raw.filter((r) => n(r.returns) > n(r.received)).length)} parties.`,
    );
  }
  if (totalCost > 0) {
    insights.push(`${inrShort(totalCost)} was spent moving this cloth back.`);
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${count(raw.length)} parties sent ${inrShort(total)} of cloth back` +
          (conc.topLabel && conc.topShare !== null ? ` — and ${conc.topLabel} alone is ${pct(conc.topShare)} of it.` : ".")
        : "No parties returned anything in this period.",
      kpis: [
        { label: "Parties", value: count(raw.length) },
        { label: "Value returned", value: inrShort(total), tone: "bad", lowerIsBetter: true },
        { label: "Biggest returner", value: conc.topShare !== null ? pct(conc.topShare) : "—", tone: conc.topShare !== null && conc.topShare > 20 ? "bad" : "warn", sub: conc.topLabel ?? undefined },
        { label: "Top 5 share", value: conc.top5Share !== null ? pct(conc.top5Share) : "—", tone: "warn" },
        { label: "Sent back twice or more", value: count(repeat.length), tone: repeat.length ? "warn" : "good", sub: raw.length ? pct((repeat.length / raw.length) * 100, 0) : undefined },
        { label: "Middle party", value: sizes.median !== null ? inrShort(sizes.median) : "—", sub: "half sent back more, half less" },
        { label: "Still active", value: count(recent.length), sub: "sent something back in 90 days" },
        { label: "Cost of moving it", value: inrShort(totalCost), tone: "warn", sub: `${qty(totalQty)} metres` },
      ],
      panels: [
        { title: "Who sends the most back", valueLabel: "Value", rows: rank(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.value), meta: `${n(r.returns)} returns` })), inrShort) },
        {
          title: "How much rests on a few parties",
          valueLabel: "Value",
          kind: "share",
          rows: rank(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.value) })), inrShort, 5),
          note: "A wide first block means the returns problem is really one customer's.",
        },
        {
          title: "Who sends back most often",
          valueLabel: "Returns",
          rows: rank(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.returns), meta: inrShort(n(r.value)) })), count),
          note: "By how MANY times, not how much. A party who sends back small amounts repeatedly is a different problem from one big return.",
        },
        { title: "Who sends the most metres back", valueLabel: "Metres", rows: rank(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.qty) })), qty) },
      ],
      insights,
      caveats: [
        noValueCaveat(noValueTotal, totalReturns),
        "This report does NOT show what each party bought, on purpose. The comparison was built and removed: the two systems keep separate party lists with no shared id, so the only join is on the NAME, and it matched fewer than one party in nine. Their histories barely overlap either — Goods Return holds years that the Orders database does not. The figure it produced was confidently wrong, so it is not offered at all. It comes back the day the two systems share a customer id.",
        "Everything here is of the PERIOD this file covers. Run it for one month and “share” means share of that month.",
        BACKDATED_CAVEAT,
      ],
    },
  };
}

export const partyAnalysis: ReportDefinition = {
  id: "goods-return.party-analysis",
  module: "goods-return",
  title: "Party return analysis",
  description:
    "One row per customer who sent cloth back — how much, how often, which cloth and why, what it cost to move, and whether they are still doing it.",
  defaultMonthsBack: 12,
  columns: [
    { key: "party", label: "Party", type: "text", width: 34 },
    { key: "returns", label: "Returns", type: "int" },
    { key: "received", label: "Received", type: "int" },
    { key: "still_out", label: "Still out", type: "int" },
    { key: "items", label: "Items", type: "int" },
    { key: "qualities", label: "Cloths", type: "int", total: "none", note: "Distinct cloths this party returned. Not added up — the same cloth from two parties is one cloth." },
    { key: "qty", label: "Metres", type: "number", unit: "MTR" },
    { key: "pieces", label: "Pieces", type: "int", unit: "PCS" },
    { key: "value", label: "Value returned", type: "money" },
    { key: "share", label: "Share of returns", type: "percent", note: "Of everything returned in this file's period." },
    { key: "avg_return", label: "Avg return", type: "money", total: "avg", avgWeightBy: "returns", note: "Value divided by the returns that carry a value — the value-less ones are excluded from both sides, the same as everywhere else on this sheet. The foot is the file-wide average, weighted by how many returns each party sent." },
    { key: "no_value", label: "With no value", type: "int", note: "Returns from this party where no figure was entered." },
    { key: "cost", label: "Cost of moving it", type: "money" },
    { key: "cost_share", label: "Cost as % of value", type: "percent", total: "avg", avgWeightBy: "value", note: "What moving the cloth cost, against what the cloth was worth. The foot is weighted by value, not a plain average of the rows." },
    { key: "top_reason", label: "Usual reason", type: "text", width: 24, note: "The reason that appears most often on this party's returns." },
    { key: "reasons", label: "Reasons used", type: "int", total: "none" },
    { key: "top_quality", label: "Usual cloth", type: "text", width: 24 },
    { key: "a_broker", label: "Broker", type: "text", width: 24, note: "One of them, where there is more than one." },
    { key: "brokers", label: "Brokers", type: "int", total: "none" },
    { key: "first_return", label: "First return", type: "date" },
    { key: "last_return", label: "Last return", type: "date" },
    { key: "days_since_last", label: "Days since last", type: "int", total: "avg", note: "To today, even when the period ends earlier — it answers “are they still sending things back”, which is a question about now." },
  ],
  filters: [
    { key: "dateRange", label: "Return date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctReturnValues("party") },
    { key: "broker", label: "Broker", kind: "select", options: () => distinctReturnValues("broker") },
    { key: "transport", label: "Transport", kind: "select", options: () => distinctReturnValues("transport") },
    { key: "reason", label: "Reason", kind: "select", options: distinctReasons },
    { key: "status", label: "Status", kind: "select", options: distinctStatuses },
  ],
  run,
};
