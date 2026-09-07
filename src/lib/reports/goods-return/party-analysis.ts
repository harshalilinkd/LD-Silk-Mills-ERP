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
  NO_VALUE_CAVEAT,
  RETURN_FILTER_SQL,
} from "./shared";

/**
 * Party analysis — one row per customer who has sent cloth back.
 *
 * ── THE COLUMN THIS REPORT EXISTS FOR IS `share_of_own` ──────────────────
 *
 * A party who returned ₹4 lakh is not automatically a problem: if they bought
 * ₹2 crore, that is 2%. A party who returned ₹40,000 against ₹80,000 bought is
 * a different conversation entirely. So this report reaches ACROSS into
 * `ld_order_entry` and prints what each party bought over the same period
 * beside what they sent back, and the percentage between them.
 *
 * The join is on the party NAME, lower-cased and trimmed, because the two
 * systems have separate party tables and no shared id. That is imperfect and
 * the report says so rather than pretending: a party whose name is spelled
 * differently in the two systems shows a blank "bought" figure, and the count
 * of those is printed on the dashboard. A blank is honest; a zero would say
 * "they bought nothing", which is a different and much worse claim.
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
      (current_date - max(r.dated))           as days_since_last,
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
  ),
  -- What the same party BOUGHT over the same dates, from the other schema.
  -- Matched on the lower-cased name because the two systems keep separate
  -- party tables with no shared id.
  bought as (
    select lower(trim(o.party_name)) as key,
           coalesce(sum(li.line_total), 0) as value,
           coalesce(sum(li.qty_mtr), 0)    as qty,
           count(distinct o.id)            as orders
    from ld_order_entry.customer_orders o
    join ld_order_entry.order_line_items li
      on li.order_id = o.id and not li.is_deleted and not li.is_cancelled
    where ($1::date is null or o.order_date >= $1::date)
      and ($2::date is null or o.order_date <= $2::date)
    group by 1
  )
  select
    r.*,
    coalesce(i.items, 0)      as items,
    coalesce(i.qty, 0)        as qty,
    coalesce(i.pieces, 0)     as pieces,
    coalesce(i.qualities, 0)  as qualities,
    i.top_quality,
    bo.value  as bought_value,
    bo.qty    as bought_qty,
    bo.orders as bought_orders
  from returned r
  left join items i on i.party = r.party
  left join bought bo on bo.key = lower(trim(r.party))
  order by r.value desc, r.returns desc, r.party
`;

type Raw = {
  party: string | null; returns: number; received: number; value: string; no_value: number;
  cost: string; first_return: string; last_return: string; days_since_last: number;
  a_broker: string | null; brokers: number; reasons: number; top_reason: string | null;
  items: number; qty: string; pieces: number; qualities: number; top_quality: string | null;
  bought_value: string | null; bought_qty: string | null; bought_orders: number | null;
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
    avg_return: n(r.returns) > 0 ? money2(n(r.value) / n(r.returns)) : null,
    no_value: n(r.no_value),
    cost: money2(r.cost),
    bought_value: r.bought_value == null ? null : money2(r.bought_value),
    bought_orders: r.bought_orders == null ? null : n(r.bought_orders),
    // The whole point of the report. Null — never zero — when the party could
    // not be matched to an Orders customer.
    share_of_own:
      r.bought_value != null && n(r.bought_value) > 0
        ? (n(r.value) / n(r.bought_value)) * 100
        : null,
    matched_to_orders: r.bought_value != null,
    top_reason: r.top_reason,
    reasons: n(r.reasons),
    top_quality: r.top_quality,
    a_broker: r.a_broker,
    brokers: n(r.brokers),
    first_return: r.first_return?.slice(0, 10) ?? null,
    last_return: r.last_return?.slice(0, 10) ?? null,
    days_since_last: n(r.days_since_last),
  }));

  const conc = concentration(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.value) })));
  const matched = raw.filter((r) => r.bought_value != null && n(r.bought_value) > 0);
  const unmatched = raw.length - matched.length;
  const ratios = matched.map((r) => (n(r.value) / n(r.bought_value)) * 100);
  const ratioSpread = spread(ratios);
  const heavy = matched
    .filter((r) => (n(r.value) / n(r.bought_value)) * 100 > 10 && n(r.value) > 0)
    .sort((a, b) => n(b.value) / n(b.bought_value) - n(a.value) / n(a.bought_value));
  const repeat = raw.filter((r) => n(r.returns) > 1);
  const totalCost = raw.reduce((s, r) => s + n(r.cost), 0);

  const insights: string[] = [];
  const ci = concentrationInsight(conc, "parties");
  if (ci) insights.push(ci);
  if (raw.length) {
    insights.push(
      `${count(repeat.length)} of ${count(raw.length)} parties have sent cloth back more than once — ${pct((repeat.length / raw.length) * 100, 0)} of them.`,
    );
  }
  if (ratioSpread.n > 0 && ratioSpread.median !== null) {
    insights.push(
      `Against what they bought, the middle party returns ${pct(ratioSpread.median, 1)} of their own value. That comparison could be made for ${count(matched.length)} of ${count(raw.length)} parties.`,
    );
  }
  if (heavy.length) {
    const top = heavy.slice(0, 3);
    insights.push(
      `${count(heavy.length)} parties sent back more than a tenth of what they bought — worst are ${top
        .map((r) => `${r.party} (${pct((n(r.value) / n(r.bought_value)) * 100, 0)} of ${inrShort(n(r.bought_value))})`)
        .join(", ")}.`,
    );
  }
  if (unmatched) {
    insights.push(
      `${count(unmatched)} parties could not be matched to an Orders customer over the same dates, so their “share of own” is blank rather than zero. Usually the name is spelled differently in the two systems.`,
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
        { label: "Middle return rate", value: ratioSpread.median !== null ? pct(ratioSpread.median, 1) : "—", sub: "of what that party bought" },
        { label: "Over a tenth back", value: count(heavy.length), tone: heavy.length ? "bad" : "good", lowerIsBetter: true, sub: "of their own purchases" },
        { label: "Not matched to Orders", value: count(unmatched), tone: unmatched ? "warn" : "good", lowerIsBetter: true, sub: "name differs between systems" },
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
          title: "Worst return rate against what they bought",
          valueLabel: "Percent back",
          rows: rank(
            heavy.map((r) => ({
              label: r.party ?? "Not recorded",
              value: (n(r.value) / n(r.bought_value)) * 100,
              meta: `${inrShort(n(r.value))} of ${inrShort(n(r.bought_value))}`,
            })),
            (v) => pct(v, 1),
          ),
          note: "Only parties matched to an Orders customer over the same dates.",
        },
        { title: "Who sends the most metres back", valueLabel: "Metres", rows: rank(raw.map((r) => ({ label: r.party ?? "Not recorded", value: n(r.qty) })), qty) },
      ],
      insights,
      caveats: [
        NO_VALUE_CAVEAT,
        "“Bought” and “share of own” come from the Orders module and are matched on the party NAME, lower-cased — the two systems keep separate party lists with no shared id. Where no match was found the column is BLANK, never zero: a blank means “we could not tell”, a zero would mean “they bought nothing”.",
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
    "One row per customer who sent cloth back — how much and how often, what it cost to move, and how that compares with what the same customer bought over the same dates.",
  defaultMonthsBack: 12,
  columns: [
    { key: "party", label: "Party", type: "text", width: 34 },
    { key: "returns", label: "Returns", type: "int" },
    { key: "received", label: "Received", type: "int" },
    { key: "still_out", label: "Still out", type: "int" },
    { key: "items", label: "Items", type: "int" },
    { key: "qualities", label: "Cloths", type: "int", total: "none", note: "Distinct cloths this party returned. Not added up — the same cloth from two parties is one cloth." },
    { key: "qty", label: "Metres", type: "number" },
    { key: "pieces", label: "Pieces", type: "int" },
    { key: "value", label: "Value returned", type: "money" },
    { key: "share", label: "Share of returns", type: "percent", note: "Of everything returned in this file's period." },
    { key: "avg_return", label: "Avg return", type: "money", total: "avg", note: "Value divided by returns. The foot recomputes it across the file rather than adding the rows." },
    { key: "no_value", label: "With no value", type: "int", note: "Returns from this party where no figure was entered." },
    { key: "cost", label: "Cost of moving it", type: "money" },
    { key: "bought_value", label: "Bought (Orders)", type: "money", note: "What this party bought over the SAME dates, from the Orders module. Blank where the name could not be matched." },
    { key: "bought_orders", label: "Orders placed", type: "int" },
    { key: "share_of_own", label: "Share of own", type: "percent", total: "none", note: "Value returned divided by value bought. Blank where the party could not be matched — a blank means “we could not tell”, not “nothing”. Not totalled: the file-wide figure is on the dashboard." },
    { key: "matched_to_orders", label: "Matched to Orders", type: "boolean" },
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
