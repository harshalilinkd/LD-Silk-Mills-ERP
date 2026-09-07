import "server-only";

import { sql as pg } from "@/db";
import { concentration, concentrationInsight, rank } from "../analysis";
import { count, inr, inrShort, pct } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { CANCELLED_CAVEAT, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * Agent and sales performance — one report, two groupings.
 *
 * ── WHY ONE REPORT AND NOT TWO ───────────────────────────────────────────
 *
 * The questions are identical and only the column changes: how much did this
 * person bring in, from how many customers, at what average order size. Two
 * files would be two places to fix the same arithmetic. The `Group by` filter
 * picks the dimension, and the file name and the Notes sheet both record which
 * one was chosen — so a workbook can never be mistaken for the other.
 *
 * ── CUSTOMERS HELD IS THE INTERESTING COLUMN ─────────────────────────────
 *
 * Value alone rewards whoever happens to hold the biggest account. Customers
 * held, average order size and the top customer's share of that agent's own
 * book together say whether somebody is building a business or riding one
 * name — and the last of those is computed per agent, not globally.
 */

const SQL = (dim: "agent" | "sales_person") => `
  with per_customer as (
    select
      coalesce(nullif(trim(o.${dim}), ''), 'Not recorded')            as who,
      o.party_name,
      count(distinct o.id)                                            as orders,
      coalesce(sum(li.line_total) filter (where not li.is_cancelled), 0) as value
    from ld_order_entry.customer_orders o
    left join ld_order_entry.order_line_items li
           on li.order_id = o.id and not li.is_deleted
    where ($1::date is null or o.order_date >= $1::date)
      and ($2::date is null or o.order_date <= $2::date)
      ${ORDER_FILTER_SQL}
    group by 1, 2
  ),
  -- The totals CTE repeats the SAME filters as per_customer above. It used to
  -- be a lateral carrying only the date bounds, so filtering by party gave a
  -- customer count for that party and a metres figure for the agent's whole
  -- book — two numbers on one row describing different things.
  totals as (
    select
      coalesce(nullif(trim(o.${dim}), ''), 'Not recorded')                as who,
      coalesce(sum(li.qty_mtr)    filter (where not li.is_cancelled), 0)  as qty_mtr,
      count(li.id) filter (where not li.is_cancelled)                     as lines,
      coalesce(sum(li.line_total) filter (where li.is_cancelled), 0)      as cancelled_value,
      min(o.order_date)                                                   as first_order,
      max(o.order_date)                                                   as last_order,
      (current_date - max(o.order_date))                                  as days_since_last
    from ld_order_entry.customer_orders o
    left join ld_order_entry.order_line_items li
           on li.order_id = o.id and not li.is_deleted
    where ($1::date is null or o.order_date >= $1::date)
      and ($2::date is null or o.order_date <= $2::date)
      ${ORDER_FILTER_SQL}
    group by 1
  )
  select
    pc.who,
    count(distinct pc.party_name)                       as customers,
    sum(pc.orders)                                      as orders,
    sum(pc.value)                                       as value,
    max(pc.value)                                       as top_customer_value,
    (array_agg(pc.party_name order by pc.value desc))[1] as top_customer,
    t.qty_mtr, t.lines, t.cancelled_value, t.first_order, t.last_order, t.days_since_last
  from per_customer pc
  join totals t on t.who = pc.who
  group by pc.who, t.qty_mtr, t.lines, t.cancelled_value, t.first_order, t.last_order, t.days_since_last
  order by 4 desc, pc.who
`;

type Raw = {
  who: string; customers: number; orders: number; value: string;
  top_customer_value: string; top_customer: string | null; qty_mtr: string;
  lines: number; cancelled_value: string; first_order: string; last_order: string;
  days_since_last: number;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const dim = params.groupBy === "sales_person" ? "sales_person" : "agent";
  const noun = dim === "agent" ? "agents" : "sales people";
  const Noun = dim === "agent" ? "Agent" : "Sales person";

  const raw = (await pg.unsafe(SQL(dim), orderFilterArgs(params))) as unknown as Raw[];
  const total = raw.reduce((s, r) => s + n(r.value), 0);

  const rows: ReportRow[] = raw.map((r) => ({
    who: r.who,
    customers: n(r.customers),
    orders: n(r.orders),
    lines: n(r.lines),
    qty_mtr: n(r.qty_mtr),
    value: money2(r.value),
    // Not rounded — see the customer ledger. The format shows one decimal.
    share: total > 0 ? (n(r.value) / total) * 100 : null,
    avg_order: n(r.orders) > 0 ? money2(n(r.value) / n(r.orders)) : null,
    avg_rate: n(r.qty_mtr) > 0 ? money2(n(r.value) / n(r.qty_mtr)) : null,
    top_customer: r.top_customer,
    top_customer_share:
      n(r.value) > 0 ? (n(r.top_customer_value) / n(r.value)) * 100 : null,
    cancelled_value: money2(r.cancelled_value),
    first_order: r.first_order?.slice(0, 10) ?? null,
    last_order: r.last_order?.slice(0, 10) ?? null,
    days_since_last: n(r.days_since_last),
  }));

  const conc = concentration(raw.map((r) => ({ label: r.who, value: n(r.value) })));
  // Somebody whose own book is mostly one name is exposed in a way value alone
  // does not show — this is the per-agent version of the concentration finding.
  const reliant = raw
    .filter((r) => n(r.value) > 0 && n(r.top_customer_value) / n(r.value) > 0.6 && n(r.customers) > 1)
    .sort((a, b) => n(b.value) - n(a.value));
  const quiet = raw.filter((r) => n(r.days_since_last) > 45);

  const insights: string[] = [];
  const ci = concentrationInsight(conc, noun);
  if (ci) insights.push(ci);
  if (raw.length) {
    const top = raw[0];
    insights.push(
      `${top.who} leads with ${inrShort(n(top.value))} from ${count(n(top.customers))} customers ` +
        `at an average order of ${inr(n(top.value) / Math.max(1, n(top.orders)))}.`,
    );
  }
  if (reliant.length) {
    insights.push(
      `${count(reliant.length)} ${noun} take more than 60% of their own value from a single customer — ` +
        reliant.slice(0, 3).map((r) => `${r.who} (${pct((n(r.top_customer_value) / n(r.value)) * 100, 0)} from ${r.top_customer})`).join(", ") +
        ".",
    );
  }
  if (quiet.length) {
    insights.push(
      `${count(quiet.length)} ${noun} have brought in nothing for over 45 days: ${quiet.slice(0, 5).map((r) => r.who).join(", ")}.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline:
        raw.length > 0
          ? `${count(raw.length)} ${noun} brought in ${inrShort(total)}. The top five are ${conc.top5Share !== null ? pct(conc.top5Share) : "most"} of it.`
          : `No ${noun} in this period.`,
      kpis: [
        { label: Noun === "Agent" ? "Agents" : "Sales people", value: count(raw.length), tone: "good" },
        { label: "Total value", value: inrShort(total) },
        { label: `Average per ${Noun.toLowerCase()}`, value: raw.length ? inrShort(total / raw.length) : "—" },
        { label: "Top share", value: conc.topShare !== null ? pct(conc.topShare) : "—", tone: "warn", sub: conc.topLabel ?? undefined },
        { label: "Top 5 share", value: conc.top5Share !== null ? pct(conc.top5Share) : "—" },
        { label: "Customers covered", value: count(raw.reduce((s, r) => s + n(r.customers), 0)), sub: "counted per person" },
        { label: "Leaning on one name", value: count(reliant.length), tone: reliant.length ? "bad" : "good", lowerIsBetter: true, sub: "over 60% from one customer" },
        { label: "Gone quiet", value: count(quiet.length), tone: quiet.length ? "warn" : "good", lowerIsBetter: true, sub: "over 45 days" },
      ],
      panels: [
        { title: "Who brought in the most", valueLabel: "Value", rows: rank(raw.map((r) => ({ label: r.who, value: n(r.value), meta: `${n(r.customers)} customers` })), inrShort) },
        {
          title: "How much rests on a few people",
          valueLabel: "Value",
          kind: "share",
          rows: rank(raw.map((r) => ({ label: r.who, value: n(r.value) })), inrShort, 5),
        },
        { title: "Who holds the most customers", valueLabel: "Customers", rows: rank(raw.map((r) => ({ label: r.who, value: n(r.customers) })), count) },
        {
          title: "Who writes the biggest orders",
          valueLabel: "Avg order",
          rows: rank(raw.filter((r) => n(r.orders) >= 2).map((r) => ({ label: r.who, value: n(r.value) / n(r.orders) })), inrShort),
          note: "Only people with two or more orders — one order is not an average.",
        },
      ],
      insights,
      caveats: [
        `This file is grouped by ${Noun.toUpperCase()}. Re-run it with the other grouping to see the same figures the other way.`,
        CANCELLED_CAVEAT,
        "An order carries one agent and one sales person, so the two groupings each add to the same total and neither double-counts.",
        "“Not recorded” is a real row, not an error — six orders have no agent against them.",
      ],
    },
  };
}

export const agentPerformance: ReportDefinition = {
  id: "order-entry.agent-performance",
  module: "order-entry",
  title: "Agent & sales performance",
  description:
    "One row per agent — or per sales person, your choice — with value, customers held, average order size, and how much of their book is a single name.",
  defaultMonthsBack: 6,
  columns: [
    { key: "who", label: "Name", type: "text", width: 26 },
    { key: "customers", label: "Customers", type: "int", total: "none", note: "How many customers this person holds. NOT added up — a customer served by two agents would be counted twice." },
    { key: "orders", label: "Orders", type: "int" },
    { key: "lines", label: "Lines", type: "int" },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "value", label: "Value", type: "money" },
    { key: "share", label: "Share", type: "percent", note: "Of the total value in this file's period." },
    { key: "avg_order", label: "Avg order", type: "money", total: "avg", note: "Value divided by orders. Averaged across the file at the foot." },
    { key: "avg_rate", label: "Avg rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Value divided by metres. The foot is weighted by metres." },
    { key: "top_customer", label: "Biggest customer", type: "text", width: 30 },
    { key: "top_customer_share", label: "From that one", type: "percent", total: "none", note: "How much of THIS person's value comes from their biggest customer. Not added up — each row is its own percentage." },
    { key: "cancelled_value", label: "Cancelled value", type: "money" },
    { key: "first_order", label: "First order", type: "date" },
    { key: "last_order", label: "Last order", type: "date" },
    { key: "days_since_last", label: "Days quiet", type: "int", total: "avg", note: "From their last order to today. Averaged at the foot." },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    {
      key: "groupBy",
      label: "Group by",
      kind: "select",
      help: "Agent, or sales person.",
      options: async () => [
        { value: "agent", label: "Agent" },
        { value: "sales_person", label: "Sales person" },
      ],
    },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
  ],
  run,
};
