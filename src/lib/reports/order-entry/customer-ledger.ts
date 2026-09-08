import "server-only";

import { sql as pg } from "@/db";
import { concentration, concentrationInsight, rank } from "../analysis";
import { count, inr, inrShort, pct } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { CANCELLED_CAVEAT, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * Customer ledger — one row per party, and the answer to "who are we".
 *
 * ── DORMANCY IS THE COLUMN NOBODY ASKS FOR AND EVERYBODY NEEDS ───────────
 *
 * A customer list sorted by value tells you who is big. `days_since_last`
 * tells you who has stopped, which is the more actionable of the two and is
 * invisible on every screen in this ERP. A party who was ₹40 lakh in July and
 * has ordered nothing for six weeks does not appear anywhere as a problem
 * until the month closes short.
 *
 * ── THE SHARE COLUMN IS OF THE FILTERED PERIOD ───────────────────────────
 *
 * Not of all time. Run this for August and "share" means share of August. That
 * is the only reading that survives being filtered, and the Notes sheet says
 * which period the file covers.
 */

const SQL = `
  select
    o.party_name,
    count(distinct o.id)                                            as orders,
    count(li.id) filter (where not li.is_cancelled)                 as lines,
    count(li.id) filter (where li.is_cancelled)                     as cancelled_lines,
    coalesce(sum(li.qty_mtr)    filter (where not li.is_cancelled), 0) as qty_mtr,
    coalesce(sum(li.line_total) filter (where not li.is_cancelled), 0) as value,
    coalesce(sum(li.line_total) filter (where li.is_cancelled), 0)     as cancelled_value,
    -- Filtered to LIVE lines. Without it a party whose only two lines were
    -- both cancelled reported "2 fabrics" beside a value of zero.
    count(distinct li.quality)   filter (where not li.is_cancelled) as qualities,
    count(distinct li.design_no) filter (where not li.is_cancelled) as designs,
    count(distinct o.agent)                                         as agents,
    min(o.order_date)                                               as first_order,
    max(o.order_date)                                               as last_order,
    ((now() at time zone 'Asia/Kolkata')::date - max(o.order_date))                              as days_since_last,
    max(o.agent)                                                    as an_agent,
    max(o.sales_person)                                             as a_sales_person,
    bool_or(o.crr_customer_id is not null)                          as in_crr
  from ld_order_entry.customer_orders o
  left join ld_order_entry.order_line_items li
         on li.order_id = o.id and not li.is_deleted
  where ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
  group by o.party_name
  order by 6 desc, o.party_name
`;

type Raw = {
  party_name: string | null; orders: number; lines: number; cancelled_lines: number;
  qty_mtr: string; value: string; cancelled_value: string; qualities: number; designs: number;
  agents: number; first_order: string; last_order: string; days_since_last: number;
  an_agent: string | null; a_sales_person: string | null; in_crr: boolean;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, orderFilterArgs(params))) as unknown as Raw[];
  const total = raw.reduce((s, r) => s + n(r.value), 0);

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
    party_name: r.party_name,
    orders: n(r.orders),
    lines: n(r.lines),
    qty_mtr: n(r.qty_mtr),
    value: money2(r.value),
    // NOT rounded here. The cell format shows one decimal; rounding the
    // stored value made 201 rows total 99.7% instead of 100%.
    share: total > 0 ? (n(r.value) / total) * 100 : null,
    avg_order: n(r.orders) > 0 ? money2(n(r.value) / n(r.orders)) : null,
    avg_rate: n(r.qty_mtr) > 0 ? money2(n(r.value) / n(r.qty_mtr)) : null,
    cancelled_lines: n(r.cancelled_lines),
    cancelled_value: money2(r.cancelled_value),
    qualities: n(r.qualities),
    designs: n(r.designs),
    agents: n(r.agents),
    an_agent: r.an_agent,
    a_sales_person: r.a_sales_person,
    first_order: r.first_order?.slice(0, 10) ?? null,
    last_order: r.last_order?.slice(0, 10) ?? null,
    days_since_last: n(r.days_since_last),
    in_crr: r.in_crr,
  }));

  const conc = concentration(raw.map((r) => ({ label: r.party_name ?? "Not recorded", value: n(r.value) })));
  const dormant = raw.filter((r) => n(r.days_since_last) > 45 && n(r.value) > 0);
  const dormantValue = dormant.reduce((s, r) => s + n(r.value), 0);
  const repeat = raw.filter((r) => n(r.orders) > 1);
  const notInCrr = raw.filter((r) => !r.in_crr);

  const insights: string[] = [];
  const ci = concentrationInsight(conc, "customers");
  if (ci) insights.push(ci);
  if (raw.length) {
    insights.push(
      `${count(repeat.length)} of ${count(raw.length)} customers ordered more than once — ` +
        `${pct((repeat.length / raw.length) * 100, 0)} came back within this period.`,
    );
  }
  if (dormant.length) {
    const worst = [...dormant].sort((a, b) => n(b.value) - n(a.value)).slice(0, 3);
    insights.push(
      `${count(dormant.length)} customers worth ${inrShort(dormantValue)} have not ordered for over 45 days — ` +
        `largest are ${worst.map((w) => `${w.party_name} (${count(n(w.days_since_last))} d)`).join(", ")}.`,
    );
  }
  if (notInCrr.length) {
    insights.push(
      `${count(notInCrr.length)} customers worth ${inrShort(notInCrr.reduce((s, r) => s + n(r.value), 0))} are not matched to a CRR account, so their orders are not being attributed there.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: !raw.length
        ? "No customers ordered in this period."
        : conc.topLabel && conc.top5Share !== null
          ? `${count(raw.length)} customers, ${inrShort(total)} between them — but the top five are ${pct(conc.top5Share)} of it.`
          : `${count(raw.length)} customers, ${inrShort(total)} between them.`,
      kpis: [
        { label: "Customers", value: count(raw.length), tone: "good" },
        { label: "Total value", value: inrShort(total) },
        { label: "Average customer", value: raw.length ? inrShort(total / raw.length) : "—" },
        { label: "Largest share", value: conc.topShare !== null ? pct(conc.topShare) : "—", tone: conc.topShare !== null && conc.topShare > 20 ? "warn" : "neutral", sub: conc.topLabel ?? undefined },
        { label: "Top 5 share", value: conc.top5Share !== null ? pct(conc.top5Share) : "—", tone: "warn" },
        { label: "80% comes from", value: conc.paretoCount !== null ? `${count(conc.paretoCount)} names` : "—" },
        { label: "Ordered again", value: raw.length ? pct((repeat.length / raw.length) * 100, 0) : "—", tone: "good", sub: `${count(repeat.length)} customers` },
        { label: "Gone quiet", value: count(dormant.length), tone: dormant.length ? "bad" : "good", lowerIsBetter: true, sub: `over 45 days · ${inrShort(dormantValue)}` },
      ],
      panels: [
        { title: "Who buys the most", valueLabel: "Value", rows: rank(raw.map((r) => ({ label: r.party_name ?? "Not recorded", value: n(r.value), meta: `${n(r.orders)} orders` })), inrShort) },
        {
          title: "How much rests on a few names",
          valueLabel: "Value",
          kind: "share",
          rows: rank(raw.map((r) => ({ label: r.party_name ?? "Not recorded", value: n(r.value) })), inrShort, 5),
          note: "A wide first block means losing one customer would be felt.",
        },
        {
          title: "Gone quietest, biggest first",
          valueLabel: "Value",
          rows: rank(dormant.map((r) => ({ label: r.party_name ?? "Not recorded", value: n(r.value), meta: `${count(n(r.days_since_last))} days` })), inrShort),
          note: "Customers worth having who have not ordered in over 45 days.",
        },
        {
          title: "Who pays the best rate",
          valueLabel: "Rate",
          rows: rank(raw.filter((r) => n(r.qty_mtr) > 100).map((r) => ({ label: r.party_name ?? "Not recorded", value: n(r.value) / n(r.qty_mtr) })), inr),
          note: "Average rupees a metre. Only customers who took over 100 metres.",
        },
      ],
      insights,
      caveats: [
        CANCELLED_CAVEAT,
        "Share, orders and value are of the PERIOD this file covers, not of all time. The Notes sheet says which period that is.",
        "“Days since last” is counted to today, even when the period ends earlier — it answers “have they gone quiet”, which is a question about now.",
      ],
    },
  };
}

export const customerLedger: ReportDefinition = {
  id: "order-entry.customer-ledger",
  module: "order-entry",
  title: "Customer ledger",
  description:
    "One row per customer — orders, metres, value, average rate, share of the book, when they first and last ordered, and how long they have been quiet.",
  defaultMonthsBack: 6,
  columns: [
    { key: "party_name", label: "Party", type: "text", width: 34 },
    { key: "orders", label: "Orders", type: "int" },
    { key: "lines", label: "Lines", type: "int" },
    { key: "qty_mtr", label: "Metres", type: "number", unit: "MTR" },
    { key: "value", label: "Value", type: "money" },
    { key: "share", label: "Share", type: "percent", note: "Of the total value in this file's period." },
    { key: "avg_order", label: "Avg order", type: "money", total: "avg", avgWeightBy: "orders", note: "Value divided by orders. The foot is the average order across the whole file, WEIGHTED by how many orders each customer placed — a plain mean of this column counts a one-order customer the same as a ninety-order one, and read 24% low." },
    { key: "avg_rate", label: "Avg rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Value divided by metres. The foot is weighted by metres." },
    { key: "cancelled_lines", label: "Cancelled lines", type: "int" },
    { key: "cancelled_value", label: "Cancelled value", type: "money" },
    { key: "qualities", label: "Fabrics", type: "int", total: "none", note: "Distinct fabrics this customer bought. Not added up — the same fabric bought by two customers is one fabric." },
    { key: "designs", label: "Designs", type: "int", total: "none", note: "Distinct designs. Not added up, for the same reason." },
    { key: "agents", label: "Agents", type: "int", total: "none", note: "How many different agents have handled this customer. Not added up." },
    { key: "an_agent", label: "Agent", type: "text", width: 22, note: "One of them, when there is more than one." },
    { key: "a_sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "first_order", label: "First order", type: "date" },
    { key: "last_order", label: "Last order", type: "date" },
    { key: "days_since_last", label: "Days quiet", type: "int", total: "avg", note: "From their last order to today. The foot shows the average, not a sum." },
    { key: "in_crr", label: "In CRR", type: "boolean" },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
