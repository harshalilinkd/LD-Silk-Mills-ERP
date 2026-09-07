import "server-only";

import { sql as pg } from "@/db";
import { AGE_BUCKETS, ageing, rank } from "../analysis";
import { count, inrShort, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { RECORDED_CAVEAT, STAGES, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * Work in progress — only what is still open, and what is holding it.
 *
 * ── HOW THIS DIFFERS FROM THE STATUS SUMMARY ─────────────────────────────
 *
 * The status summary is the whole book with a column saying where each order
 * reached. This is the ACTION LIST: lines that have not finished, sorted by
 * how long they have been sitting, with the next stage each one is waiting on.
 * One is a record; the other is a morning's work. Keeping them separate is why
 * neither has to compromise — a report that tries to be both ends up filtered
 * every time it is opened.
 *
 * ── AGE IS FROM THE ORDER DATE, NOT FROM THE LAST TICK ───────────────────
 *
 * A line whose last stage was ticked yesterday can still be eleven weeks old,
 * and eleven weeks is what the customer is experiencing. Both are carried —
 * `days_open` from the order and `days_since_move` from the last tick — because
 * the first says how bad it is and the second says whether anybody is on it.
 */

const SQL = `
  with progress as (
    select
      p.order_line_item_id,
      max(w.sort_order) filter (where p.is_done)  as reached,
      max(p.actual_at)  filter (where p.is_done)  as last_tick
    from ld_order_entry.line_stage_progress p
    join ld_order_entry.workflow_stages w on w.stage_key = p.stage_key
    group by p.order_line_item_id
  )
  select
    o.order_no, o.order_date, o.party_name, o.agent, o.sales_person, o.transport, o.haste,
    li.quality, li.design_no, li.qty_mtr, li.line_total,
    coalesce(pr.reached, 0)                       as reached_no,
    coalesce(done.label, 'Not started')            as reached,
    next_stage.label                               as waiting_on,
    pr.last_tick,
    (current_date - o.order_date)                  as days_open
  from ld_order_entry.order_line_items li
  join ld_order_entry.customer_orders o on o.id = li.order_id
  left join progress pr on pr.order_line_item_id = li.id
  left join ld_order_entry.workflow_stages done      on done.sort_order = pr.reached
  left join ld_order_entry.workflow_stages next_stage on next_stage.sort_order = coalesce(pr.reached, 0) + 1
  where not li.is_deleted and not li.is_cancelled
    -- open = has not finished the last stage
    and coalesce(pr.reached, 0) < (select max(sort_order) from ld_order_entry.workflow_stages)
    and ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
  order by (current_date - o.order_date) desc, o.order_no
`;

type Raw = {
  order_no: string; order_date: string; party_name: string | null; agent: string | null;
  sales_person: string | null; transport: string | null; haste: string | null;
  quality: string | null; design_no: string | null; qty_mtr: string; line_total: string;
  reached_no: number; reached: string; waiting_on: string | null;
  last_tick: string | null; days_open: number;
};

const bucketOf = (d: number) => AGE_BUCKETS.find((b) => d <= b.max)?.label ?? "Over 60 days";

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, orderFilterArgs(params))) as unknown as Raw[];
  const today = Date.now();

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
    order_no: r.order_no,
    order_date: r.order_date?.slice(0, 10) ?? null,
    party_name: r.party_name,
    agent: r.agent,
    sales_person: r.sales_person,
    transport: r.transport,
    haste: r.haste,
    quality: r.quality,
    design_no: r.design_no,
    qty_mtr: n(r.qty_mtr),
    line_total: money2(r.line_total),
    reached: r.reached,
    waiting_on: r.waiting_on ?? "—",
    days_open: n(r.days_open),
    age_bucket: bucketOf(n(r.days_open)),
    last_tick: r.last_tick,
    days_since_move: r.last_tick
      ? Math.round(((today - new Date(r.last_tick).getTime()) / 86_400_000) * 10) / 10
      : null,
  }));

  const value = raw.reduce((s, r) => s + n(r.line_total), 0);
  const metres = raw.reduce((s, r) => s + n(r.qty_mtr), 0);
  const days = raw.map((r) => n(r.days_open));
  const over30 = raw.filter((r) => n(r.days_open) > 30);
  const notStarted = raw.filter((r) => n(r.reached_no) === 0);

  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const byWaiting = new Map<string, number>();
  const valueByWaiting = new Map<string, number>();
  const byParty = new Map<string, number>();
  const byTransport = new Map<string, number>();
  for (const r of raw) {
    const w = r.waiting_on ?? "—";
    add(byWaiting, w, 1);
    add(valueByWaiting, w, n(r.line_total));
    add(byParty, r.party_name?.trim() || "Not recorded", n(r.line_total));
    add(byTransport, r.transport?.trim() || "Not recorded", 1);
  }

  const insights: string[] = [];
  if (raw.length) {
    insights.push(
      `${count(raw.length)} lines worth ${inrShort(value)} have not reached Received LR. ` +
        `${count(over30.length)} of them — ${pct((over30.length / raw.length) * 100, 0)} — have been open more than 30 days.`,
    );
    const worst = [...byWaiting].sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      insights.push(
        `The biggest queue is at ${worst[0]}: ${count(worst[1])} lines worth ${inrShort(valueByWaiting.get(worst[0]) ?? 0)} are waiting to pass it.`,
      );
    }
    if (notStarted.length) {
      insights.push(
        `${count(notStarted.length)} lines worth ${inrShort(notStarted.reduce((s, r) => s + n(r.line_total), 0))} have no stage ticked at all.`,
      );
    }
    const oldest = raw[0];
    if (oldest) {
      insights.push(
        `The oldest open line is order ${oldest.order_no} for ${oldest.party_name ?? "an unnamed party"} — ` +
          `${count(n(oldest.days_open))} days, waiting on ${oldest.waiting_on ?? "nothing recorded"}.`,
      );
    }
  } else {
    insights.push("Nothing is open in this period — every line has reached Received LR.");
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      kpis: [
        { label: "Open lines", value: count(raw.length), tone: "warn" },
        { label: "Open value", value: inrShort(value), tone: "warn" },
        { label: "Open metres", value: qty(Math.round(metres)) },
        { label: "Over 30 days", value: count(over30.length), tone: over30.length ? "bad" : "good", sub: raw.length ? pct((over30.length / raw.length) * 100, 0) : undefined },
        { label: "Never started", value: count(notStarted.length), tone: notStarted.length ? "bad" : "good" },
        { label: "Oldest", value: raw.length ? `${count(Math.max(...days))} d` : "—", tone: "bad" },
        { label: "Middle age", value: raw.length ? `${count(days.sort((a, b) => a - b)[Math.floor(days.length / 2)])} d` : "—" },
        { label: "Customers waiting", value: count(byParty.size) },
      ],
      panels: [
        { title: "What they are waiting on", valueLabel: "Lines", rows: rank([...byWaiting].map(([label, v]) => ({ label, value: v })), count, STAGES.length) },
        ageing(raw.map((r) => n(r.days_open))),
        { title: "Open value by customer", valueLabel: "Value", rows: rank([...byParty].map(([label, v]) => ({ label, value: v })), inrShort) },
        { title: "Open lines by transporter", valueLabel: "Lines", rows: rank([...byTransport].map(([label, v]) => ({ label, value: v })), count) },
      ],
      insights,
      caveats: [
        "Open means the line has not finished Received LR, the last stage. Cancelled and deleted lines are excluded.",
        "Age is counted from the ORDER DATE, which is what the customer is experiencing. “Days since move” is counted from the last stage ticked, which says whether anybody is working on it.",
        RECORDED_CAVEAT,
      ],
    },
  };
}

export const workInProgress: ReportDefinition = {
  id: "order-entry.work-in-progress",
  module: "order-entry",
  title: "Work in progress",
  description:
    "Only what is still open — every line that has not reached Received LR, oldest first, with the stage it is waiting on and how long it has sat there.",
  columns: [
    { key: "days_open", label: "Days open", type: "int", note: "From the order date to today." },
    { key: "age_bucket", label: "Age", type: "text", width: 13 },
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 20 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "haste", label: "Haste", type: "text", width: 12 },
    { key: "quality", label: "Quality", type: "text", width: 24 },
    { key: "design_no", label: "Design no", type: "text", width: 15 },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "line_total", label: "Value", type: "money" },
    { key: "reached", label: "Reached", type: "text", width: 17 },
    { key: "waiting_on", label: "Waiting on", type: "text", width: 17, note: "The next stage that has not been ticked." },
    { key: "days_since_move", label: "Days since move", type: "number", note: "Since the last stage was ticked. Blank means nothing has ever been ticked." },
    { key: "last_tick", label: "Last ticked", type: "datetime" },
    { key: "transport", label: "Transport", type: "text", width: 22 },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
