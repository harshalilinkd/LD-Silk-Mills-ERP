import "server-only";

import { sql as pg } from "@/db";
import { todayIso } from "@/lib/dates";
import { AGE_BUCKETS, ageing, rank, spread } from "../analysis";
import { count, inrShort, pct, plural } from "../format";
import { money2, n } from "../num";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";

/**
 * CRM follow-up register — one row per delivery somebody is meant to ring
 * about.
 *
 * ── ONE REPORT, BECAUSE THERE IS ONE GRAIN WORTH REPORTING ON ────────────
 *
 * CRM has six tables and only one of them has rows: 74 follow-ups. Attempts,
 * issues and ratings are all empty, so a "call log" report and a "rating
 * analysis" report would both be an empty sheet with a nice header. They get
 * built the day somebody starts making calls; until then this is the module's
 * report and it is the useful one.
 *
 * ── WHAT THIS FILE IS ACTUALLY FOR ───────────────────────────────────────
 *
 * Every one of the 74 is DUE, none has been contacted, no attempt has been
 * recorded and no rating exists. That is not a defect in the report — it is
 * the finding, and it is the first thing the dashboard says. A follow-up queue
 * nobody works is worse than no queue at all, because it looks like the
 * customer was asked.
 *
 * ── "LATE" HERE IS THE SYSTEM'S OPINION, NOT THE CUSTOMER'S ──────────────
 *
 * `system_on_time` is computed from our own dispatch and transit dates.
 * `customer_says_on_time` is what the customer answered when rung, and is null
 * on every row because nobody has rung. The two columns sit side by side and
 * are never merged: the whole point of the call is to find out where they
 * disagree.
 */
const SQL = `
  select
    f.id,
    f.order_no,
    o.order_date,
    o.party_name,
    o.agent,
    o.sales_person,
    o.transport,
    f.status,
    f.delivery_basis,
    f.delivered_at,
    f.due_at,
    f.contacted_at,
    f.attempt_count,
    f.contact_person,
    f.contact_phone,
    f.system_on_time,
    f.customer_says_on_time,
    f.delay_reason,
    f.rating_overall,
    f.rating_source,
    f.reorder_intent,
    f.reorder_note,
    f.is_escalated,
    f.notes,
    f.created_by,
    f.completed_by,
    f.created_at,
    -- The order's own money, so "who is waiting for a call" can be sorted by
    -- what it is worth. Cancelled lines excluded, the same rule every Orders
    -- report follows.
    coalesce(v.value, 0) as order_value,
    coalesce(v.lines, 0) as order_lines
  from ld_order_entry.crm_followups f
  left join ld_order_entry.customer_orders o on o.id = f.order_id
  left join lateral (
    select sum(li.line_total) as value, count(*) as lines
    from ld_order_entry.order_line_items li
    where li.order_id = f.order_id and not li.is_deleted and not li.is_cancelled
  ) v on true
  where ($1::date is null or f.due_at::date >= $1::date)
    and ($2::date is null or f.due_at::date <= $2::date)
    and ($3::text is null or o.party_name = $3::text)
    and ($4::text is null or o.agent = $4::text)
    and ($5::text is null or f.status = $5::text)
  -- Most overdue first, then the order number, then the id — the id is the
  -- tiebreak that makes two runs of the same period produce the same file.
  order by f.due_at asc, f.order_no, f.id
`;

type Raw = {
  id: string; order_no: string | null; order_date: string | null; party_name: string | null;
  agent: string | null; sales_person: string | null; transport: string | null; status: string;
  delivery_basis: string | null; delivered_at: string | null; due_at: string | null;
  contacted_at: string | null; attempt_count: number | null; contact_person: string | null;
  contact_phone: string | null; system_on_time: boolean | null; customer_says_on_time: boolean | null;
  delay_reason: string | null; rating_overall: number | null; rating_source: string | null;
  reorder_intent: string | null; reorder_note: string | null; is_escalated: boolean;
  notes: string | null; created_by: string | null; completed_by: string | null; created_at: string;
  order_value: string; order_lines: number;
};

const BASIS: Record<string, string> = {
  received_lr: "LR received",
  dispatch_transit: "Dispatched, in transit",
};

const bucketOf = (d: number) => AGE_BUCKETS.find((b) => d <= b.max)?.label ?? "Over 60 days";

const days = (from: string | null, to: string) =>
  from ? Math.round((Date.parse(to) - Date.parse(from.slice(0, 10))) / 86_400_000) : null;

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [
    params.from ?? null,
    params.to ?? null,
    params.party ?? null,
    params.agent ?? null,
    params.status ?? null,
  ])) as unknown as Raw[];
  const today = todayIso();

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const due = r.due_at?.slice(0, 10) ?? null;
    const overdue = !r.contacted_at && due ? days(due, today) : null;
    return {
      order_no: r.order_no,
      order_date: r.order_date?.slice(0, 10) ?? null,
      party_name: r.party_name,
      agent: r.agent,
      sales_person: r.sales_person,
      transport: r.transport,
      order_value: money2(r.order_value),
      order_lines: n(r.order_lines),
      status: r.status,
      delivery_basis: r.delivery_basis ? (BASIS[r.delivery_basis] ?? r.delivery_basis) : null,
      delivered_on: r.delivered_at?.slice(0, 10) ?? null,
      due_on: due,
      // Positive means the call is late. Blank once somebody has rung.
      days_overdue: overdue != null && overdue > 0 ? overdue : null,
      age: overdue != null && overdue > 0 ? bucketOf(overdue) : "Not due yet",
      contacted: !!r.contacted_at,
      contacted_on: r.contacted_at?.slice(0, 10) ?? null,
      days_to_contact: r.contacted_at && due ? days(due, r.contacted_at.slice(0, 10)) : null,
      attempts: n(r.attempt_count),
      contact_person: r.contact_person,
      contact_phone: r.contact_phone,
      system_on_time: r.system_on_time,
      customer_says_on_time: r.customer_says_on_time,
      // Only meaningful once both are known, which needs somebody to have rung.
      they_disagree:
        r.system_on_time != null && r.customer_says_on_time != null
          ? r.system_on_time !== r.customer_says_on_time
          : null,
      delay_reason: r.delay_reason,
      rating_overall: r.rating_overall,
      rating_source: r.rating_source,
      reorder_intent: r.reorder_intent,
      reorder_note: r.reorder_note,
      is_escalated: r.is_escalated,
      notes: r.notes,
      created_by: r.created_by,
      completed_by: r.completed_by,
      created_at: r.created_at,
    };
  });

  // ── the figures ─────────────────────────────────────────────────────────
  const contacted = raw.filter((r) => r.contacted_at);
  const waiting = raw.filter((r) => !r.contacted_at);
  const overdueDays = waiting
    .map((r) => days(r.due_at?.slice(0, 10) ?? null, today))
    .filter((d): d is number => d != null && d > 0);
  const lateNow = overdueDays.length;
  const value = raw.reduce((s, r) => s + n(r.order_value), 0);
  const waitingValue = waiting.reduce((s, r) => s + n(r.order_value), 0);
  const systemLate = raw.filter((r) => r.system_on_time === false).length;
  const rated = raw.filter((r) => r.rating_overall != null);
  const ratings = spread(rated.map((r) => n(r.rating_overall)));
  const noAttempt = raw.filter((r) => n(r.attempt_count) === 0).length;

  const byParty = new Map<string, number>();
  const byAgent = new Map<string, number>();
  const byBasis = new Map<string, number>();
  for (const r of raw) {
    const p = r.party_name?.trim() || "Not recorded";
    byParty.set(p, (byParty.get(p) ?? 0) + n(r.order_value));
    byAgent.set(r.agent?.trim() || "No agent", (byAgent.get(r.agent?.trim() || "No agent") ?? 0) + 1);
    const b = r.delivery_basis ? (BASIS[r.delivery_basis] ?? r.delivery_basis) : "Not recorded";
    byBasis.set(b, (byBasis.get(b) ?? 0) + 1);
  }

  const insights: string[] = [];
  if (raw.length) {
    insights.push(
      `${count(waiting.length)} of ${count(raw.length)} deliveries are still waiting for a call — ${pct((waiting.length / Math.max(1, raw.length)) * 100, 0)} of the queue, covering ${inrShort(waitingValue)} of orders.`,
    );
  }
  if (noAttempt === raw.length && raw.length) {
    insights.push(
      `No call has been attempted on ANY of them. The queue is being built correctly and worked by nobody, which is worse than having no queue: the follow-up exists, so it looks from the outside as though the customer was asked.`,
    );
  } else if (noAttempt) {
    insights.push(`${count(noAttempt)} have had no call attempted at all.`);
  }
  if (lateNow) {
    const worst = Math.max(...overdueDays);
    insights.push(
      `${plural(lateNow, "call")} ${lateNow === 1 ? "is" : "are"} past their due date, the oldest by ${count(worst)} days.`,
    );
  }
  if (systemLate) {
    insights.push(
      `Our own dates say ${count(systemLate)} of these ${count(raw.length)} deliveries were late — ${pct((systemLate / Math.max(1, raw.length)) * 100, 0)}. Whether the customer agrees is the question the call is for, and it is unanswered on every row.`,
    );
  }
  const escalatedNow = raw.filter((r) => r.is_escalated).length;
  if (escalatedNow) {
    insights.push(`${plural(escalatedNow, "follow-up")} ${escalatedNow === 1 ? "has" : "have"} been escalated.`);
  }
  if (ratings.n > 0 && ratings.median !== null) {
    insights.push(`${count(ratings.n)} deliveries have been rated; the middle score is ${ratings.median.toFixed(1)} out of 5.`);
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${count(waiting.length)} of ${count(raw.length)} customers are still waiting to be called about their delivery.`
        : "No follow-ups in this period.",
      kpis: [
        { label: "Follow-ups", value: count(raw.length) },
        { label: "Still to call", value: count(waiting.length), tone: waiting.length ? "bad" : "good", lowerIsBetter: true, sub: inrShort(waitingValue) },
        { label: "Called", value: count(contacted.length), tone: contacted.length ? "good" : "bad" },
        { label: "Past the due date", value: count(lateNow), tone: lateNow ? "bad" : "good", lowerIsBetter: true },
        { label: "No attempt made", value: count(noAttempt), tone: noAttempt ? "bad" : "good", lowerIsBetter: true },
        { label: "Late by our dates", value: count(systemLate), tone: systemLate ? "warn" : "good", sub: raw.length ? pct((systemLate / raw.length) * 100, 0) : undefined },
        { label: "Rated", value: count(rated.length), tone: rated.length ? "good" : "warn", sub: ratings.median !== null ? `middle ${ratings.median.toFixed(1)} of 5` : "nobody has rated one" },
        { label: "Order value in the queue", value: inrShort(value) },
      ],
      panels: [
        {
          ...ageing(overdueDays),
          title: "How long the calls have been overdue",
          valueLabel: "Follow-ups",
          note: "Counted from the due date to today, for the ones nobody has rung.",
        },
        { title: "Whose orders are waiting on a call", valueLabel: "Order value", rows: rank([...byParty].map(([label, value]) => ({ label, value })), inrShort) },
        { title: "Which agents' customers are in the queue", valueLabel: "Follow-ups", rows: rank([...byAgent].map(([label, value]) => ({ label, value })), count) },
        {
          title: "What triggered the follow-up",
          valueLabel: "Follow-ups",
          kind: "share",
          rows: rank([...byBasis].map(([label, value]) => ({ label, value })), count, 5),
          note: "Whether the clock started at dispatch or when the LR came back.",
        },
      ],
      insights,
      caveats: [
        "“Late by our dates” is the SYSTEM's opinion, computed from our dispatch and transit dates. “Customer says on time” is what they answered when rung. The two are never merged — finding where they disagree is the whole point of the call — and the second is blank until somebody rings.",
        "Attempts, issues raised on a call, and rating scores live in their own tables and are all EMPTY. Those reports get built when there is something to report; until then the columns here are blank because nothing has been recorded, not because the report cannot read them.",
        "Order value excludes cancelled lines, the same rule every Orders report follows, so it is what should actually be delivered.",
        "Follow-up rows are created automatically from deliveries. Nobody creates one by hand, so an order missing from this list means the delivery has not been recorded, not that the call was skipped.",
      ],
    },
  };
}

export const followupRegister: ReportDefinition = {
  id: "crm.followup-register",
  module: "crm",
  title: "Follow-up register",
  description:
    "One row per delivery due a call — who, what the order was worth, when it was due, whether anybody rang, and what the customer said. The list of who is still waiting.",
  defaultMonthsBack: 6,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 32 },
    { key: "agent", label: "Agent", type: "text", width: 22 },
    { key: "sales_person", label: "Sales person", type: "text", width: 18 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "order_value", label: "Order value", type: "money", note: "Cancelled lines excluded." },
    { key: "order_lines", label: "Lines", type: "int" },
    { key: "status", label: "Status", type: "text", width: 14 },
    { key: "delivery_basis", label: "Clock started at", type: "text", width: 22, note: "Whether the follow-up was timed from dispatch or from the LR coming back." },
    { key: "delivered_on", label: "Delivered on", type: "date" },
    { key: "due_on", label: "Call due on", type: "date" },
    { key: "days_overdue", label: "Days overdue", type: "int", total: "avg", note: "Past the due date and still not rung. Blank once somebody has called. The foot shows the average, not a sum." },
    { key: "age", label: "How overdue", type: "text", width: 14, badge: { "0\u20137 days": "good", "8\u201315 days": "good", "16\u201330 days": "warn", "31\u201360 days": "warn", "Over 60 days": "bad", "Not due yet": "good" } },
    { key: "contacted", label: "Called", type: "boolean",
      // The call list, coloured. Amber on the ones nobody has rung — which is
      // every row today, and that IS the finding this report exists to make.
      // An honest column of amber beats a colourless one that hides it.
      badge: { No: "warn" },
      note: "Filter this to No for the day's call list." },
    { key: "contacted_on", label: "Called on", type: "date" },
    { key: "days_to_contact", label: "Days to call", type: "int", total: "avg", note: "From the due date to the day it was actually rung. Negative means it was rung early." },
    { key: "attempts", label: "Attempts", type: "int" },
    { key: "contact_person", label: "Contact", type: "text", width: 22 },
    { key: "contact_phone", label: "Phone", type: "text", width: 16 },
    { key: "system_on_time", label: "On time (our dates)", type: "boolean",
      // Both sides coloured here, unlike most columns: late delivery is the
      // thing being measured, so "on time" is a result and not the background.
      badge: { Yes: "good", No: "bad" },
      note: "Computed from our own dispatch and transit dates." },
    { key: "customer_says_on_time", label: "On time (customer)", type: "boolean",
      badge: { Yes: "good", No: "bad" },
      note: "What they answered when rung. Blank until somebody rings, and a blank is not a No." },
    { key: "they_disagree", label: "We disagree", type: "boolean",
      // Our record and the customer's memory do not match. Nothing else on the
      // sheet is a reason to pick up the phone the way this is.
      badge: { Yes: "bad" },
      note: "Our dates and the customer's answer differ. Blank until both are known." },
    { key: "delay_reason", label: "Delay reason", type: "text", width: 24 },
    { key: "rating_overall", label: "Rating", type: "int", total: "avg", note: "Out of 5. The foot shows the average of the ones that have been rated." },
    { key: "rating_source", label: "Rating from", type: "text", width: 14, optional: true },
    { key: "reorder_intent", label: "Will reorder", type: "text", width: 14 },
    { key: "reorder_note", label: "Reorder note", type: "text", width: 28, optional: true },
    { key: "is_escalated", label: "Escalated", type: "boolean",
      // Only Yes. An escalation is the exception; not being escalated is what
      // every ordinary follow-up looks like.
      badge: { Yes: "bad" },
      note: "Raised beyond the person who owns the follow-up." },
    { key: "notes", label: "Notes", type: "text", width: 32, optional: true },
    { key: "created_by", label: "Raised by", type: "text", width: 22 },
    { key: "completed_by", label: "Closed by", type: "text", width: 22 },
    { key: "created_at", label: "Raised at", type: "datetime" },
  ],
  filters: [
    { key: "dateRange", label: "Call due", kind: "dateRange" },
    {
      key: "party",
      label: "Party",
      kind: "select",
      options: async () => {
        const rows = await pg.unsafe(
          `select distinct o.party_name as v
             from ld_order_entry.crm_followups f
             join ld_order_entry.customer_orders o on o.id = f.order_id
            where o.party_name is not null and o.party_name <> '' order by 1`,
        );
        return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
      },
    },
    {
      key: "agent",
      label: "Agent",
      kind: "select",
      options: async () => {
        const rows = await pg.unsafe(
          `select distinct o.agent as v
             from ld_order_entry.crm_followups f
             join ld_order_entry.customer_orders o on o.id = f.order_id
            where o.agent is not null and o.agent <> '' order by 1`,
        );
        return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
      },
    },
    {
      key: "status",
      label: "Status",
      kind: "select",
      options: async () => {
        const rows = await pg.unsafe(
          `select distinct status as v from ld_order_entry.crm_followups order by 1`,
        );
        return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
      },
    },
  ],
  run,
};
