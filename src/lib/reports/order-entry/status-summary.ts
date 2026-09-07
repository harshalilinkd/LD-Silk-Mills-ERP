import "server-only";

import { sql as pg } from "@/db";
import { AGE_BUCKETS, ageing, rank } from "../analysis";
import { count, inrShort, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import { RECORDED_CAVEAT, STAGES, distinctValues, money2, n, ORDER_FILTER_SQL, orderFilterArgs } from "./shared";

/**
 * Order status summary — the whole book, with where each order has reached.
 *
 * ── AN ORDER IS ONLY AS FAR AS ITS SLOWEST LINE ──────────────────────────
 *
 * `reached` is the furthest stage EVERY live line has finished, not the
 * furthest any line reached. The alternative reports an order as dispatched
 * because one line of forty was, which is the kind of number that gets a
 * customer told the wrong thing on the phone.
 *
 * `furthest_line` is carried beside it, so an order where thirty-nine lines
 * are done and one is stuck reads correctly as both: held at stock checking,
 * but with most of it through.
 *
 * ── AND WHY THIS IS NOT THE WORK-IN-PROGRESS REPORT ──────────────────────
 *
 * This one is the record: every order in the period, finished or not. WIP is
 * the action list — only what is open, per LINE, sorted by age. Somebody
 * closing a month wants this; somebody chasing dispatch wants that.
 */

const SQL = `
  with per_line as (
    select
      li.order_id,
      li.id as line_id,
      coalesce(max(w.sort_order) filter (where p.is_done), 0) as reached,
      max(p.actual_at) filter (where p.is_done)               as last_tick
    from ld_order_entry.order_line_items li
    left join ld_order_entry.line_stage_progress p on p.order_line_item_id = li.id
    left join ld_order_entry.workflow_stages w on w.stage_key = p.stage_key
    where not li.is_deleted and not li.is_cancelled
    group by li.order_id, li.id
  ),
  rolled as (
    select
      order_id,
      min(reached)   as slowest,
      max(reached)   as furthest,
      max(last_tick) as last_tick,
      count(*)       as live_lines,
      count(*) filter (where reached = (select max(sort_order) from ld_order_entry.workflow_stages)) as finished_lines
    from per_line group by order_id
  ),
  amounts as (
    select
      li.order_id,
      coalesce(sum(li.qty_mtr)    filter (where not li.is_cancelled), 0) as qty_mtr,
      coalesce(sum(li.line_total) filter (where not li.is_cancelled), 0) as value,
      count(*) filter (where li.is_cancelled)                            as cancelled_lines
    from ld_order_entry.order_line_items li
    where not li.is_deleted
    group by li.order_id
  )
  select
    o.order_no, o.order_date, o.party_name, o.agent, o.sales_person, o.transport, o.haste,
    coalesce(a.qty_mtr, 0) as qty_mtr, coalesce(a.value, 0) as value,
    coalesce(a.cancelled_lines, 0) as cancelled_lines,
    coalesce(r.live_lines, 0)     as live_lines,
    coalesce(r.finished_lines, 0) as finished_lines,
    coalesce(slow.label, 'Not started')     as reached,
    coalesce(far.label, 'Not started')      as furthest_line,
    coalesce(r.slowest, 0)                  as reached_no,
    r.last_tick,
    (current_date - o.order_date)           as days_open,
    o.lot_no, o.challan_no
  from ld_order_entry.customer_orders o
  left join rolled  r on r.order_id = o.id
  left join amounts a on a.order_id = o.id
  left join ld_order_entry.workflow_stages slow on slow.sort_order = r.slowest
  left join ld_order_entry.workflow_stages far  on far.sort_order  = r.furthest
  where ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
  order by coalesce(r.slowest, 0), o.order_date desc
`;

type Raw = {
  order_no: string; order_date: string; party_name: string | null; agent: string | null;
  sales_person: string | null; transport: string | null; haste: string | null;
  qty_mtr: string; value: string; cancelled_lines: number; live_lines: number;
  finished_lines: number; reached: string; furthest_line: string; reached_no: number;
  last_tick: string | null; days_open: number; lot_no: string | null; challan_no: string | null;
};

const LAST = STAGES.length; // sort_order of Received LR
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
    reached: r.reached,
    furthest_line: r.furthest_line,
    is_complete: n(r.reached_no) >= LAST,
    live_lines: n(r.live_lines),
    finished_lines: n(r.finished_lines),
    lines_pct: n(r.live_lines) > 0 ? Math.round((n(r.finished_lines) / n(r.live_lines)) * 1000) / 10 : null,
    cancelled_lines: n(r.cancelled_lines),
    qty_mtr: n(r.qty_mtr),
    value: money2(r.value),
    days_open: n(r.days_open),
    age_bucket: bucketOf(n(r.days_open)),
    days_since_move: r.last_tick
      ? Math.round(((today - new Date(r.last_tick).getTime()) / 86_400_000) * 10) / 10
      : null,
    last_tick: r.last_tick,
    lot_no: r.lot_no,
    challan_no: r.challan_no,
  }));

  const complete = raw.filter((r) => n(r.reached_no) >= LAST);
  const open = raw.filter((r) => n(r.reached_no) < LAST);
  const notStarted = raw.filter((r) => n(r.reached_no) === 0);
  const value = raw.reduce((s, r) => s + n(r.value), 0);
  const openValue = open.reduce((s, r) => s + n(r.value), 0);
  const openOver30 = open.filter((r) => n(r.days_open) > 30);

  const byStage = new Map<string, number>();
  const valueByStage = new Map<string, number>();
  const openByParty = new Map<string, number>();
  const openByTransport = new Map<string, number>();
  for (const r of raw) {
    byStage.set(r.reached, (byStage.get(r.reached) ?? 0) + 1);
    valueByStage.set(r.reached, (valueByStage.get(r.reached) ?? 0) + n(r.value));
  }
  for (const r of open) {
    const p = r.party_name?.trim() || "Not recorded";
    const t = r.transport?.trim() || "Not recorded";
    openByParty.set(p, (openByParty.get(p) ?? 0) + n(r.value));
    openByTransport.set(t, (openByTransport.get(t) ?? 0) + 1);
  }

  const partlyDone = open.filter((r) => n(r.finished_lines) > 0 && n(r.finished_lines) < n(r.live_lines));

  const insights: string[] = [];
  if (raw.length) {
    insights.push(
      `${count(complete.length)} of ${count(raw.length)} orders are complete — ${pct((complete.length / raw.length) * 100, 0)}. ` +
        `The other ${count(open.length)} carry ${inrShort(openValue)}.`,
    );
    const worstStage = [...byStage].filter(([k]) => k !== STAGES[STAGES.length - 1].label).sort((a, b) => b[1] - a[1])[0];
    if (worstStage) {
      insights.push(
        `The most common resting place is ${worstStage[0]}: ${count(worstStage[1])} orders worth ${inrShort(valueByStage.get(worstStage[0]) ?? 0)} are held there.`,
      );
    }
    if (partlyDone.length) {
      insights.push(
        `${count(partlyDone.length)} orders are part-finished — some lines through, some not. ` +
          `They read as held at their slowest line, which is what a customer waiting on the whole order experiences.`,
      );
    }
    if (openOver30.length) {
      insights.push(
        `${count(openOver30.length)} open orders worth ${inrShort(openOver30.reduce((s, r) => s + n(r.value), 0))} are more than 30 days old.`,
      );
    }
    if (notStarted.length) {
      insights.push(`${count(notStarted.length)} orders have no stage ticked on any line at all.`);
    }
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      kpis: [
        { label: "Orders", value: count(raw.length) },
        { label: "Complete", value: count(complete.length), tone: "good", sub: raw.length ? pct((complete.length / raw.length) * 100, 0) : undefined },
        { label: "Still open", value: count(open.length), tone: open.length ? "warn" : "good" },
        { label: "Open value", value: inrShort(openValue), tone: "warn", sub: value > 0 ? `${pct((openValue / value) * 100, 0)} of the book` : undefined },
        { label: "Never started", value: count(notStarted.length), tone: notStarted.length ? "bad" : "good" },
        { label: "Open over 30 days", value: count(openOver30.length), tone: openOver30.length ? "bad" : "good" },
        { label: "Part-finished", value: count(partlyDone.length), sub: "some lines through" },
        { label: "Open metres", value: qty(Math.round(open.reduce((s, r) => s + n(r.qty_mtr), 0))) },
      ],
      panels: [
        { title: "Orders by where they reached", valueLabel: "Orders", rows: rank([...byStage].map(([label, value]) => ({ label, value })), count, STAGES.length + 1) },
        { title: "Value by where they reached", valueLabel: "Value", rows: rank([...valueByStage].map(([label, value]) => ({ label, value })), inrShort, STAGES.length + 1) },
        ageing(open.map((r) => n(r.days_open))),
        { title: "Open value by customer", valueLabel: "Value", rows: rank([...openByParty].map(([label, value]) => ({ label, value })), inrShort) },
      ],
      insights,
      caveats: [
        "“Reached” is the furthest stage EVERY live line of the order has finished. One line still at stock checking holds the whole order there — which is what the customer experiences. “Furthest line” is carried beside it for the other reading.",
        "Cancelled lines are excluded from the stage roll-up and from value, but counted in their own column.",
        RECORDED_CAVEAT,
        ...(raw.length > MAX_EXPORT_ROWS
          ? [`Only the first ${count(MAX_EXPORT_ROWS)} of ${count(raw.length)} orders are in the Data sheet.`]
          : []),
      ],
    },
  };
}

export const statusSummary: ReportDefinition = {
  id: "order-entry.status-summary",
  module: "order-entry",
  title: "Order status summary",
  description:
    "Every order with where it has reached, how much of it is through, how long it has been open, and what is still outstanding.",
  defaultMonthsBack: 3,
  columns: [
    { key: "reached", label: "Reached", type: "text", width: 17, note: "The furthest stage EVERY live line has finished." },
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 20 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "haste", label: "Haste", type: "text", width: 12 },
    { key: "is_complete", label: "Complete", type: "boolean" },
    { key: "furthest_line", label: "Furthest line", type: "text", width: 17, note: "The furthest stage ANY line has finished." },
    { key: "live_lines", label: "Live lines", type: "int" },
    { key: "finished_lines", label: "Lines finished", type: "int" },
    { key: "lines_pct", label: "Lines through", type: "percent" },
    { key: "cancelled_lines", label: "Cancelled lines", type: "int" },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "value", label: "Value", type: "money" },
    { key: "days_open", label: "Days open", type: "int" },
    { key: "age_bucket", label: "Age", type: "text", width: 13 },
    { key: "days_since_move", label: "Days since move", type: "number" },
    { key: "last_tick", label: "Last ticked", type: "datetime" },
    { key: "lot_no", label: "Lot no", type: "text", width: 14 },
    { key: "challan_no", label: "Challan no", type: "text", width: 14 },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
