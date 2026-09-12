import "server-only";

import { sql as pg } from "@/db";
import { todayIso } from "@/lib/dates";
import {
  AGE_BUCKETS,
  addGrouped,
  ageing,
  concentration,
  matrixFrom,
  monthDelta,
  concentrationInsight,
  contributorInsight,
  contributors,
  groupNames,
  rank,
  runRate,
  spread,
  trend,
  trendInsight,
} from "../analysis";
import { count, inr, inrShort, monthName, pct, qty } from "../format";
import type {
  ReportDefinition,
  ReportParams,
  ReportResult,
  ReportRow,
} from "../types";
import { MAX_EXPORT_ROWS } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Order register — one row per order
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The biggest and most demanding of them, which is why it is the
 * one the engine was proved on. It joins the order header to its lines, rolls
 * up quantity and value, and works out where the order has reached without
 * fetching forty thousand stage rows into JavaScript.
 *
 * ── THE JOIN THAT INFLATES EVERY COUNT ───────────────────────────────────
 *
 * `customer_orders` joined to `order_line_items` returns one row per LINE. The
 * first version of this counted `count(*)` and reported 2,900 orders in July
 * against a true figure of 161 — an eighteen-fold error that looked entirely
 * plausible on a dashboard. Every count of orders in this file is
 * `count(distinct o.id)`, and the aggregation happens in a subquery so the
 * header row can never be multiplied by its own lines.
 *
 * ── WHAT "CANCELLED" AND "DELETED" MEAN HERE ─────────────────────────────
 *
 * A cancelled line stays in the order and is reported — it is a real thing
 * that happened, and cancellation value is one of the numbers worth watching.
 * It is simply excluded from the order's value, quantity and rate so those
 * describe what will actually be delivered. A deleted line is excluded
 * everywhere: it was a mistake being unmade, not an event.
 */

/** What `Reached` says for an order whose every line was cancelled or removed. */
const NOTHING_LIVE = "All lines cancelled";

const REGISTER_SQL = `
  with lines as (
    select
      li.order_id,
      count(*)                                                                  as line_count,
      count(*) filter (where li.is_cancelled)                                   as cancelled_lines,
      coalesce(sum(li.qty_mtr)   filter (where not li.is_cancelled), 0)         as qty_mtr,
      coalesce(sum(li.line_total) filter (where not li.is_cancelled), 0)        as value,
      coalesce(sum(li.line_total) filter (where li.is_cancelled), 0)            as cancelled_value,
      -- LIVE lines only. Counting cancelled ones made this report say 226
      -- fabrics where the line detail said 223 over the same period.
      count(distinct li.quality)   filter (where not li.is_cancelled)           as qualities,
      count(distinct li.design_no) filter (where not li.is_cancelled)           as designs,
      -- THE NAMES, not just how many. "Fabrics: 2" tells a reader an order has
      -- two of something and then makes them open another sheet to find out
      -- which — the screen has said "ASTOR, Platinum." in that column all
      -- along. Sorted so two runs of the same order produce the same string,
      -- and filtered exactly like the count beside it so the two can never
      -- disagree about what is on the order.
      string_agg(distinct li.quality, ', ' order by li.quality)
        filter (where not li.is_cancelled)                                      as quality_names,
      -- Lines whose quality AND design already appear on this order. The
      -- order's totals stay right either way; this is here so a reader
      -- comparing the sheet against a printout knows the repeat is real.
      count(*) filter (where not li.is_cancelled)
        - count(distinct (li.quality, li.design_no)) filter (where not li.is_cancelled) as repeated_lines
    from ld_order_entry.order_line_items li
    where not li.is_deleted
    group by li.order_id
  ),
  per_line as (
    select
      li.order_id,
      li.id as line_id,
      -- on_hold is sort_order 0, so it can never inflate "how far it reached"
      -- (see ASIDE_STAGE_KEYS). It IS read separately below, because a held
      -- line is not a finished one whatever its stages say.
      coalesce(max(w.sort_order) filter (where p.is_done), 0) as reached,
      coalesce(bool_or(p.is_done) filter (where p.stage_key = 'on_hold'), false) as held,
      max(p.actual_at) filter (where p.is_done and p.stage_key <> 'on_hold') as last_tick,
      -- When this line actually finished, and when it was due to. The last
      -- flow stage is the one that means "gone and acknowledged", so it is
      -- the only honest end of the clock.
      max(p.actual_at)  filter (where p.is_done and p.stage_key = 'received_lr') as finished_at,
      max(p.planned_at) filter (where p.stage_key = 'received_lr')               as due_at
    from ld_order_entry.order_line_items li
    left join ld_order_entry.line_stage_progress p on p.order_line_item_id = li.id
    left join ld_order_entry.workflow_stages w on w.stage_key = p.stage_key
    where not li.is_deleted and not li.is_cancelled
    group by li.order_id, li.id
  ),
  progress as (
    -- Where the order has reached: the furthest stage EVERY one of its live
    -- lines has finished. "Furthest stage ANY line reached" would call an
    -- order dispatched because one line of forty was, which is how a customer
    -- gets told the wrong thing on the phone. The other reading is carried
    -- beside it as the furthest column.
    select
      order_id,
      min(reached)   as reached,
      max(reached)   as furthest,
      max(last_tick) as last_tick,
      count(*)       as live_lines,
      -- A finished line is one that reached the LAST stage and is not held.
      count(*) filter (where reached = (select max(sort_order) from ld_order_entry.workflow_stages)
                         and not held)
                     as finished_lines,
      count(*) filter (where held) as held_lines,
      -- The order finishes when its LAST line does, so max() on both sides.
      -- due_at is present on every stage row (it is generated from the
      -- order date), so the comparison is never one-sided.
      max(finished_at) as finished_at,
      max(due_at)      as due_at
    from per_line group by order_id
  )
  select
    o.order_no,
    o.order_date,
    o.party_name,
    o.agent,
    o.sales_person,
    o.transport,
    o.haste,
    o.lot_no,
    o.challan_no,
    coalesce(l.line_count, 0)       as line_count,
    coalesce(l.cancelled_lines, 0)  as cancelled_lines,
    coalesce(l.qualities, 0)        as qualities,
    coalesce(l.designs, 0)          as designs,
    l.quality_names,
    coalesce(l.repeated_lines, 0)   as repeated_lines,
    coalesce(l.qty_mtr, 0)          as qty_mtr,
    coalesce(l.value, 0)            as value,
    coalesce(l.cancelled_value, 0)  as cancelled_value,
    case when coalesce(l.qty_mtr, 0) > 0
         then coalesce(l.value, 0) / l.qty_mtr end as avg_rate,
    coalesce(ws.label, 'Not started')  as stage,
    coalesce(far.label, 'Not started') as furthest_line,
    coalesce(pr.reached, 0)            as reached_no,
    coalesce(pr.live_lines, 0)         as live_lines,
    coalesce(pr.finished_lines, 0)     as finished_lines,
    coalesce(pr.held_lines, 0)         as held_lines,
    pr.last_tick,
    pr.finished_at,
    pr.due_at,
    ((now() at time zone 'Asia/Kolkata')::date - o.order_date)      as days_open,
    (o.crr_customer_id is not null)    as in_crr,
    o.remarks,
    o.created_by,
    o.created_at
  from ld_order_entry.customer_orders o
  left join lines    l  on l.order_id = o.id
  left join progress pr on pr.order_id = o.id
  left join ld_order_entry.workflow_stages ws  on ws.sort_order  = pr.reached
  left join ld_order_entry.workflow_stages far on far.sort_order = pr.furthest
  where ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    and ($3::text is null or o.party_name   = $3::text)
    and ($4::text is null or o.agent        = $4::text)
    and ($5::text is null or o.sales_person = $5::text)
    -- An order whose every line was deleted is what the Orders screen and
    -- the Trash page both call a DELETED order (isOrderDeleted, in
    -- lib/order-entry/workflow-constants.ts), not a live one with nothing
    -- in it. l.order_id is only non-null here for an order the lines CTE
    -- found at least one un-deleted line for, so this is the same rule,
    -- expressed as a join condition rather than recomputed. Before this, an
    -- order in that state (LD-02: one line, deleted) was counted here and
    -- on the Sales dashboard while both other screens correctly called it
    -- gone — the two-screens-disagree failure this file exists to prevent.
    and l.order_id is not null
  -- Ends in the row's own id. Without a unique tiebreak Postgres is free to
  -- return equal rows in a different order every run, and the same report
  -- run twice would produce two differently-ordered files.
  order by o.order_date desc, o.order_no desc, o.id
`;

type Raw = {
  order_no: string;
  order_date: string;
  party_name: string | null;
  agent: string | null;
  sales_person: string | null;
  transport: string | null;
  haste: string | null;
  lot_no: string | null;
  challan_no: string | null;
  line_count: number;
  cancelled_lines: number;
  qualities: number;
  designs: number;
  quality_names: string | null;
  repeated_lines: number;
  qty_mtr: string;
  value: string;
  cancelled_value: string;
  avg_rate: string | null;
  stage: string;
  furthest_line: string;
  reached_no: number;
  live_lines: number;
  finished_lines: number;
  held_lines: number;
  last_tick: string | null;
  finished_at: string | null;
  due_at: string | null;
  days_open: number;
  in_crr: boolean;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
};

const n = (v: string | number | null | undefined) =>
  v == null ? 0 : Number(v);

const bucketOf = (d: number) =>
  AGE_BUCKETS.find((b) => d <= b.max)?.label ?? "Over 60 days";

/** Whole days between an order date and an instant — a same-day finish is 0. */
function daysBetween(dateIso: string, atIso: string): number {
  const a = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(atIso).getTime();
  return Math.floor((b - a) / 86_400_000);
}

/**
 * How big the order is, as a band.
 *
 * The cut points are this book's own quartiles (₹68.5k / ₹1.68L / ₹3.5L over
 * 350 orders) rounded to figures somebody would say out loud — so each band
 * holds a real share of the book. An even split of the RANGE would not: the
 * top end is a single ₹26.5 L order, and four of the five bands would be
 * empty.
 */
const SIZE_BANDS: { max: number; label: string }[] = [
  { max: 50_000, label: "Under 50 k" },
  { max: 100_000, label: "50 k - 1 L" },
  { max: 250_000, label: "1 - 2.5 L" },
  { max: 500_000, label: "2.5 - 5 L" },
  { max: Infinity, label: "Over 5 L" },
];
const sizeBandOf = (v: number) => SIZE_BANDS.find((b) => v <= b.max)!.label;

/** Lead-time buckets, for "how long did the finished ones actually take". */
const LEAD_BANDS: { max: number; label: string }[] = [
  { max: 7, label: "Within a week" },
  { max: 15, label: "8-15 days" },
  { max: 30, label: "16-30 days" },
  { max: 60, label: "31-60 days" },
  { max: Infinity, label: "Over 60 days" },
];
const leadBandOf = (d: number) => LEAD_BANDS.find((b) => d <= b.max)!.label;

/**
 * The middle value. Used for order size and lead time, both skewed enough
 * that the mean misleads — one ₹26.5 L order and one 103-day order drag
 * their averages well above what a typical order looks like.
 */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Not started, then the seven stages in order — so a funnel reads downwards. */
const STAGE_ORDER = [
  "Not started",
  "Order Entry",
  "Stock Checking",
  "Rolling & Checking",
  "Challan",
  "Bill",
  "Dispatch",
  "Received LR",
];

async function distinctValues(
  column: string,
): Promise<{ value: string; label: string }[]> {
  // The column name is a literal from this file, never from a request.
  const rows = await pg.unsafe(
    `select distinct ${column} as v from ld_order_entry.customer_orders
      where ${column} is not null and ${column} <> '' order by 1`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({
    value: r.v,
    label: r.v,
  }));
}

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(REGISTER_SQL, [
    params.from ?? null,
    params.to ?? null,
    params.party ?? null,
    params.agent ?? null,
    params.salesPerson ?? null,
  ])) as unknown as Raw[];

  const totalRows = raw.length;
  const capped = raw.slice(0, MAX_EXPORT_ROWS);

  // ── ONE CLOCK FOR THE WHOLE RUN ──────────────────────────────────
  //
  // The clock used to be read INSIDE the row loop, once per row. Two
  // consequences, and the second is the one verification caught:
  //
  //   · Rows at the top and the bottom of a 6,000-row file could describe
  //     DIFFERENT instants. "Days since move" is rounded to a tenth of a day,
  //     so a row sitting on that boundary reads 4.2 near the start of the run
  //     and 4.3 near the end — one file, two clocks.
  //   · Two runs seconds apart produced different bytes, which is exactly what
  //     the byte-identical check in `.scratch/verify.ts` is for. It looked
  //     like non-deterministic ORDERING and was not: the ORDER BY has carried
  //     a total tie-break on the line id all along.
  //
  // A report describes ONE moment, the moment it was run. Read once, use
  // everywhere.
  const runAt = Date.now();

  const rows: ReportRow[] = capped.map((r) => ({
    order_no: r.order_no,
    order_date: r.order_date?.slice(0, 10) ?? null,
    party_name: r.party_name,
    agent: r.agent,
    sales_person: r.sales_person,
    transport: r.transport,
    haste: r.haste,
    // "Not started" is what the stage table says when there are no stages,
    // which is true of a brand-new order AND of one whose every line was
    // cancelled. Only the second of those is finished with; saying so is the
    // difference between a chase list and a wrong chase list.
    stage: n(r.live_lines) === 0 ? NOTHING_LIVE : r.stage,
    furthest_line: n(r.live_lines) === 0 ? NOTHING_LIVE : r.furthest_line,
    // `reached_no` is the LOWEST stage any live line reached, so >= the last
    // stage means every line got there. `held_lines` takes a held order back
    // out of complete, which is the owner's rule (Sep 2026).
    is_complete:
      n(r.live_lines) > 0 && n(r.reached_no) >= 7 && n(r.held_lines) === 0,
    held_lines: n(r.held_lines),
    // Blank, not zero: an order nothing is waiting on has no age to report,
    // and a 0 would sit in the footer average pulling it down.
    days_open: n(r.live_lines) === 0 ? null : n(r.days_open),
    age_bucket: n(r.live_lines) === 0 ? null : bucketOf(n(r.days_open)),
    live_lines: n(r.live_lines),
    finished_lines: n(r.finished_lines),
    lines_through:
      n(r.live_lines) > 0
        ? (n(r.finished_lines) / n(r.live_lines)) * 100
        : null,
    days_since_move: r.last_tick
      ? Math.round(
          ((runAt - new Date(r.last_tick).getTime()) / 86_400_000) * 10,
        ) / 10
      : null,
    last_tick: r.last_tick,
    // ── DELIVERY, NOT JUST PROGRESS ──────────────────────────────────────
    //
    // Blank until the order has actually finished. A half-done order has no
    // lead time yet, and writing today's gap instead would drag the average
    // towards "fast" using orders that have not arrived — the opposite of
    // the truth. Blank is also what keeps them out of the footer average.
    finished_on: r.finished_at ? r.finished_at.slice(0, 10) : null,
    due_on: r.due_at ? r.due_at.slice(0, 10) : null,
    lead_days:
      r.finished_at && r.order_date ? daysBetween(r.order_date, r.finished_at) : null,
    on_time:
      r.finished_at && r.due_at
        ? new Date(r.finished_at).getTime() <= new Date(r.due_at).getTime()
        : null,
    size_band: sizeBandOf(n(r.value)),
    line_count: n(r.line_count),
    cancelled_lines: n(r.cancelled_lines),
    qualities: n(r.qualities),
    designs: n(r.designs),
    quality_names: r.quality_names,
    repeated_lines: n(r.repeated_lines),
    qty_mtr: n(r.qty_mtr),
    value: n(r.value),
    // Rounded here, not left to the cell format: the CSV has no format to
    // hide behind, and 190.58064516129033 in a rate column looks like a bug.
    avg_rate:
      r.avg_rate === null ? null : Math.round(n(r.avg_rate) * 100) / 100,
    cancelled_value: n(r.cancelled_value),
    lot_no: r.lot_no,
    challan_no: r.challan_no,
    in_crr: r.in_crr,
    remarks: r.remarks,
    created_by: r.created_by,
    created_at: r.created_at,
  }));

  // ── the analysis, over every matching row (not just the capped ones) ────
  const totalValue = raw.reduce((s, r) => s + n(r.value), 0);
  const totalQty = raw.reduce((s, r) => s + n(r.qty_mtr), 0);
  const cancelledValue = raw.reduce((s, r) => s + n(r.cancelled_value), 0);
  const cancelledLines = raw.reduce((s, r) => s + n(r.cancelled_lines), 0);
  const lineCount = raw.reduce((s, r) => s + n(r.line_count), 0);

  const byMonth = new Map<string, number>();
  const byStage = new Map<string, number>();
  // ── NAMES ARE GROUPED CASE-INSENSITIVELY ─────────────────────────────
  //
  // 27 of this book's 156 agent names are a second spelling of another —
  // "GAURAV"/"Gaurav", "Self"/"SELF", "Akash Textiles Agency" and its
  // shouted twin. Ranked on the raw string, one agent appears twice with
  // half their book each and neither lands where they belong, which makes
  // "who brings the most business" quietly wrong. Same for customers.
  // See `groupKey` in analysis.ts.
  const partyG = new Map<string, { value: number; spellings: Map<string, number> }>();
  const agentG = new Map<string, { value: number; spellings: Map<string, number> }>();
  const partyOrdersG = new Map<string, { value: number; spellings: Map<string, number> }>();
  // Value and metres per month, so the average rate per metre can be
  // tracked over time — see the "rate per metre" insight.
  const monthQty = new Map<string, number>();

  for (const r of raw) {
    const month = (r.order_date ?? "").slice(0, 7);
    const v = n(r.value);
    if (month) {
      byMonth.set(month, (byMonth.get(month) ?? 0) + v);
      monthQty.set(month, (monthQty.get(month) ?? 0) + n(r.qty_mtr));
    }
    addGrouped(partyG, r.party_name?.trim() || "Not recorded", v);
    addGrouped(partyOrdersG, r.party_name?.trim() || "Not recorded", 1);
    // "Not recorded", matching agent performance. The same six orders were
    // bucketed as "No agent" here and "Not recorded" there, in two files
    // that go out together.
    addGrouped(agentG, r.agent?.trim() || "Not recorded", v);
    byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
  }
  const byParty = groupNames(partyG);
  const byAgent = groupNames(agentG);
  const partyOrders = groupNames(partyOrdersG);

  // ── AN ORDER WITH NOTHING LIVE IS NEITHER OPEN NOR COMPLETE ───────────
  //
  // Four orders have no live line: three had every line cancelled, one had
  // its only line deleted. Open-ness is `reached_no < 7`, and an order with
  // no lines has no stages, so all four read as "Not started, open 33 days"
  // FOREVER. They sat inside "Still open 264", inside the ageing panel, and
  // inside "open over a month" - and once `Reached` gained its badge they
  // were amber, telling somebody to chase an order that was cancelled.
  //
  // They stay ON the register, because they were placed and their cancelled
  // value is real. They are simply not counted as work outstanding.
  const nothingLive = raw.filter((r) => n(r.live_lines) === 0);
  const complete = raw.filter(
    (r) => n(r.live_lines) > 0 && n(r.reached_no) >= 7 && n(r.held_lines) === 0,
  );
  const open = raw.filter(
    (r) => n(r.live_lines) > 0 && (n(r.reached_no) < 7 || n(r.held_lines) > 0),
  );
  /** Orders that could still be finished — the honest denominator. */
  const liveOrders = raw.length - nothingLive.length;
  const openValue = open.reduce((s, r) => s + n(r.value), 0);
  const openOver30 = open.filter((r) => n(r.days_open) > 30);
  const partlyDone = open.filter(
    (r) => n(r.finished_lines) > 0 && n(r.finished_lines) < n(r.live_lines),
  );

  // ── "REACHED" IS A RECORDING GAP BEFORE IT IS A BACKLOG ──────────────
  //
  // Nearly every order before July reads "Not started" and nearly every
  // one after shows progress — that is when the mill began ticking
  // stages, not six months of stalled work. A reader who does not know
  // sees an enormous backlog on the single most prominent column here.
  // Detected from the data, so it stays true if the old months are ever
  // filled in and disappears once they are.
  const stageByMonth = new Map<string, { total: number; notStarted: number }>();
  for (const r of raw) {
    const m = (r.order_date ?? "").slice(0, 7);
    if (!m || n(r.live_lines) === 0) continue;
    const g = stageByMonth.get(m) ?? { total: 0, notStarted: 0 };
    g.total++;
    if (n(r.reached_no) === 0) g.notStarted++;
    stageByMonth.set(m, g);
  }
  const stageMonths = [...stageByMonth.keys()].sort();
  const darkMonths = stageMonths.filter((m) => {
    const g = stageByMonth.get(m)!;
    return g.total >= 10 && g.notStarted / g.total >= 0.9;
  });
  const litMonths = stageMonths.filter((m) => {
    const g = stageByMonth.get(m)!;
    return g.total >= 10 && g.notStarted / g.total < 0.5;
  });
  const trackingNote =
    darkMonths.length && litMonths.length && darkMonths[darkMonths.length - 1] < litMonths[0]
      ? `“Reached”, “Complete”, “Days open” and the ageing panel are only meaningful from ${monthName(litMonths[0])} onwards. ` +
        `Before that, ${count(darkMonths.length)} months show 90% or more of orders as “Not started” — that is when stage ticking ` +
        `began in the mill, NOT a backlog. Those older orders are almost certainly delivered; nobody recorded the stages.`
      : null;

  const repeatedLines = raw.reduce((s, r) => s + n(r.repeated_lines), 0);
  const repeatedOrders = raw.filter((r) => n(r.repeated_lines) > 0).length;

  // ── DELIVERY ───────────────────────────────────────────────────────────
  //
  // The register could say who bought what and how far it had got, and
  // nothing at all about whether the mill delivers. These three are that
  // gap: how much old money is sitting in the book, how long a finished
  // order actually took, and how often the target was met.
  //
  // `agedValue` is the one worth leading with. "Open over a month" was
  // already counted, but as a COUNT — and 42 old orders is a fact nobody
  // acts on, while the rupees inside them is a fact somebody does.
  const openOver30Value = openOver30.reduce((s, r) => s + n(r.value), 0);
  const finished = raw.filter((r) => r.finished_at && r.order_date);
  const leadDays = finished.map((r) => daysBetween(r.order_date, r.finished_at!));
  const medianLead = median(leadDays);
  const comparable = raw.filter((r) => r.finished_at && r.due_at);
  const onTimeCount = comparable.filter(
    (r) => new Date(r.finished_at!).getTime() <= new Date(r.due_at!).getTime(),
  ).length;
  const onTimePct = comparable.length ? (onTimeCount / comparable.length) * 100 : null;
  // The MIDDLE order, not the mean — one ₹26.5 L order pulls the mean well
  // above anything typical, and "average order" is read as "a normal one".
  const medianOrderValue = median(raw.map((r) => n(r.value)));

  // New against returning, by first order date across THIS file's rows.
  // A customer whose first order in the period is this one is new TO THE
  // PERIOD, which is the only thing this file can honestly say — an older
  // customer who last bought before the window looks new here, so the
  // insight says "in this period" rather than claiming they are new.
  const firstSeen = new Map<string, string>();
  for (const r of raw) {
    const p = r.party_name?.trim() || "Not recorded";
    const d = r.order_date ?? "";
    if (!d) continue;
    const cur = firstSeen.get(p);
    if (!cur || d < cur) firstSeen.set(p, d);
  }
  const repeatParties = [...byParty.keys()].filter(
    (p) => (partyOrders.get(p) ?? 0) > 1,
  ).length;
  const repeatPct = byParty.size ? (repeatParties / byParty.size) * 100 : null;

  const conc = concentration(
    [...byParty].map(([label, value]) => ({ label, value })),
  );
  const t = trend(byMonth, inrShort);
  const rateSpread = spread(raw.map((r) => n(r.avg_rate)).filter((x) => x > 0));

  // Month-on-month movers, so the dashboard answers "what happened" and not
  // only "who is big".
  const months = [...byMonth.keys()].sort();
  const thisMonth = months.at(-1);
  const lastMonth = months.at(-2);
  const partyIn = (m: string | undefined) => {
    const out = new Map<string, number>();
    if (!m) return out;
    for (const r of raw) {
      if ((r.order_date ?? "").slice(0, 7) !== m) continue;
      const p = r.party_name?.trim() || "Not recorded";
      out.set(p, (out.get(p) ?? 0) + n(r.value));
    }
    return out;
  };
  const movers = contributors(partyIn(thisMonth), partyIn(lastMonth));

  // Run rate, only when the period runs to today — projecting a month that
  // ended three weeks ago is nonsense dressed as forecasting.
  const today = todayIso();
  const endsToday = !params.to || params.to >= today;
  const day = Number(today.slice(8, 10));
  const daysThisMonth = new Date(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
    0,
  ).getDate();
  const projected =
    endsToday && thisMonth === today.slice(0, 7)
      ? runRate(byMonth.get(thisMonth) ?? 0, day, daysThisMonth)
      : null;

  const insights: string[] = [];
  const ci = concentrationInsight(conc, "customers");
  if (ci) insights.push(ci);
  const ti = trendInsight(t, "order value");
  if (ti) insights.push(ti);
  // Delivery leads the sentences when there is anything to say about it —
  // it is the part of this report that was missing, and the part a manager
  // can act on this week.
  if (openOver30.length) {
    insights.push(
      `${inrShort(openOver30Value)} is sitting in ${count(openOver30.length)} orders more than a month old — ` +
        `${pct((openOver30Value / (openValue || 1)) * 100, 0)} of everything still to deliver.`,
    );
  }
  // ── IS THE RATE MOVING? ──────────────────────────────────────────────
  //
  // Value and metres were both on this report and the rate between them
  // was only ever shown as one all-period figure, so a book drifting down
  // in price looked exactly like a steady one. Weighted per month (value
  // over metres), never a mean of the order rates — the same rule the
  // Avg rate column follows.
  const rateMonths = [...byMonth.keys()].sort().filter((m) => (monthQty.get(m) ?? 0) > 0);
  if (rateMonths.length >= 2) {
    const rateOf = (m: string) => (byMonth.get(m) ?? 0) / (monthQty.get(m) ?? 1);
    const first = rateMonths[0];
    const last = rateMonths[rateMonths.length - 1];
    const move = ((rateOf(last) - rateOf(first)) / rateOf(first)) * 100;
    insights.push(
      `The rate per metre went from ${inr(rateOf(first))} in ${monthName(first)} to ${inr(rateOf(last))} in ${monthName(last)}` +
        (Math.abs(move) < 1
          ? " — effectively flat."
          : ` — ${move > 0 ? "up" : "down"} ${pct(Math.abs(move), 0)} across the period.`) +
        " Weighted by metres each month, so one large order cannot swing it.",
    );
  }

  if (medianLead !== null) {
    insights.push(
      `The ${count(finished.length)} finished orders took ${medianLead} days from order to Received LR at the middle` +
        (onTimePct !== null
          ? `, and ${pct(onTimePct, 0)} of them met their planned date.`
          : "."),
    );
  }
  const mi = contributorInsight(movers, inrShort, "customers");
  if (mi && lastMonth) insights.push(mi);
  if (cancelledValue > 0) {
    insights.push(
      `${count(cancelledLines)} of ${count(lineCount)} lines were cancelled, worth ${inrShort(cancelledValue)} — ` +
        `${pct((cancelledValue / (totalValue + cancelledValue)) * 100, 2)} of everything written.`,
    );
  }
  if (
    rateSpread.median !== null &&
    rateSpread.max !== null &&
    rateSpread.min !== null
  ) {
    insights.push(
      `The middle order sells at ${inr(rateSpread.median)} a metre; the range runs ${inr(rateSpread.min)} to ${inr(rateSpread.max)}.`,
    );
  }
  if (projected !== null) {
    insights.push(
      `${monthName(thisMonth!)} stands at ${inrShort(byMonth.get(thisMonth!) ?? 0)} after ${day} days — ` +
        `on track for roughly ${inrShort(projected)} if the rest of the month looks like the start.`,
    );
  }

  if (repeatedLines > 0) {
    insights.push(
      `${count(repeatedOrders)} orders list the same fabric and design more than once — ${count(repeatedLines)} extra lines in all. ` +
        `That is allowed — the same fabric and design can go at two rates or for two lots. The totals are right either way; it is worth a glance only where the two lines look identical.`,
    );
  }

  if (raw.length) {
    insights.push(
      `${count(complete.length)} of ${count(liveOrders)} orders are finished. The other ${count(open.length)} carry ${inrShort(openValue)}` +
        (partlyDone.length
          ? `, and ${count(partlyDone.length)} of those are part done — some lines through, some not.`
          : "."),
    );
  }

  const caveats: string[] = [
    "Order value excludes cancelled lines, so it is what should actually be delivered. Cancelled value is reported separately.",
    ...(trackingNote ? [trackingNote] : []),
    "Customer, agent and sales-person names that differ only in capitalisation are added together on the charts above — 27 of this book's agent names are a second spelling of another. The Data sheet shows exactly what was typed.",
    "“Orders met their date” counts whole ORDERS that were acknowledged by their due date. The Orders dashboard's “On-time %” counts every stage TICK instead, so the two read differently on the same period and both are correct — a young order has many early ticks and has not yet had time to be late.",
    "Due dates are generated from the order date plus the stage offsets in Time tracking; they are an internal target, not a date promised to the customer. If those offsets have not been set to how the mill actually runs, this figure says as much about the targets as about the work.",
    "Stage is the furthest point EVERY live line of the order has passed. One line still at stock checking holds the whole order there.",
  ];
  if (totalRows > MAX_EXPORT_ROWS) {
    caveats.push(
      `Only the first ${count(MAX_EXPORT_ROWS)} of ${count(totalRows)} orders are in the Data sheet. The figures above cover all ${count(totalRows)}.`,
    );
  }

  return {
    rows,
    totalRows,
    analysis: {
      headline: !raw.length
        ? "No orders in this period."
        : conc.topShare !== null && conc.topLabel
          ? `${inrShort(totalValue)} of orders from ${count(byParty.size)} customers — and ${conc.topLabel} alone is ${pct(conc.topShare)} of it.`
          : `${inrShort(totalValue)} of orders across ${count(raw.length)} orders.`,
      // ── THE FIRST SIX ARE THE TILES; THE REST GO ON THE "ALSO" LINE ────
      //
      // The dashboard renders six and collapses everything after into one
      // sentence, so this order is a decision about what a manager sees
      // first. It was: value, orders, metres, rate, cancelled, customers —
      // four of which are size, none of which is a question anybody has to
      // answer today. Delivery now takes three of the six, because 62% of
      // the open book being over a month old is the thing on this report
      // most worth acting on and nothing here used to say it.
      kpis: [
        {
          label: "Order value",
          value: inrShort(totalValue),
          tone: "neutral",
          sub: "cancelled lines left out",
          deltaPct: monthDelta(byMonth),
        },
        {
          label: "Still to deliver",
          value: inrShort(openValue),
          tone: "warn",
          sub: totalValue > 0
            ? `${pct((openValue / totalValue) * 100, 0)} of the order book`
            : undefined,
        },
        {
          label: "Older than a month",
          value: inrShort(openOver30Value),
          tone: openOver30Value > 0 ? "bad" : "good",
          lowerIsBetter: true,
          sub: openValue > 0
            ? `${pct((openOver30Value / openValue) * 100, 0)} of what is still open`
            : `${count(openOver30.length)} orders`,
        },
        {
          // ── NOT THE SAME FIGURE AS THE ORDERS DASHBOARD, ON PURPOSE ────
          //
          // The dashboard's "On-time %" counts every STAGE TICK and asks
          // whether that tick beat its own planned time; this counts whole
          // ORDERS and asks whether the goods were acknowledged by the
          // order's due date. Over the same 30 days the first reads 56%
          // and the second 18%, and both are right — a young order has
          // plenty of early ticks and has not yet had time to be late.
          // Verified once against SQL: per-tick is 13% all-time and 56%
          // over the dashboard's last 30 days; per-order is 18% all-time.
          //
          // Two figures called "On-time %" in one ERP is the
          // two-screens-disagree failure this module keeps writing rules
          // about, so this one is NAMED for what it measures and its sub
          // line states the denominator.
          label: "Orders met their date",
          value: onTimePct === null ? "—" : pct(onTimePct, 0),
          tone: onTimePct === null ? "neutral" : onTimePct < 50 ? "bad" : onTimePct < 80 ? "warn" : "good",
          sub: comparable.length
            ? `${count(onTimeCount)} of ${count(comparable.length)} finished orders`
            : "nothing finished yet",
        },
        {
          label: "Days to finish",
          value: medianLead === null ? "—" : count(medianLead),
          tone: "neutral",
          lowerIsBetter: true,
          sub: medianLead === null ? "nothing finished yet" : "the middle order",
        },
        {
          label: "Orders",
          value: count(raw.length),
          tone: "good",
          sub: `${count(lineCount - cancelledLines)} lines`,
        },
        { label: "Metres", value: qty(Math.round(totalQty)), tone: "neutral" },
        {
          label: "Middle order",
          value: medianOrderValue === null ? "—" : inrShort(medianOrderValue),
          tone: "neutral",
          sub: "half are bigger, half smaller",
        },
        {
          label: "Repeat customers",
          value: repeatPct === null ? "—" : pct(repeatPct, 0),
          tone: "neutral",
          sub: `${count(repeatParties)} of ${count(byParty.size)} ordered more than once`,
        },
        {
          label: "Average rate",
          value: totalQty > 0 ? inr(totalValue / totalQty) : "—",
          tone: "neutral",
          sub: "per metre",
        },
        {
          label: "Cancelled",
          lowerIsBetter: true,
          value:
            totalValue + cancelledValue > 0
              ? pct((cancelledValue / (totalValue + cancelledValue)) * 100, 2)
              : "—",
          tone: cancelledValue > 0 ? "bad" : "good",
          sub: inrShort(cancelledValue),
        },
        {
          label: "Customers",
          // byParty, not conc.n — the concentration helper drops names with no
          // live value, which made this read 199 while the customer ledger
          // read 201 for the same period. Two reports must not disagree on how
          // many customers there were.
          value: count(byParty.size),
          tone: "neutral",
          sub:
            conc.top5Share !== null
              ? `top 5 = ${pct(conc.top5Share, 0)}`
              : undefined,
        },
        {
          label: "Agents",
          // The blank-agent bucket is a placeholder, not a name. Counting it
          // overstated the agent count by one on every run that had an order
          // with no agent on it.
          value: count(
            [...byAgent.keys()].filter((k) => k !== "Not recorded").length,
          ),
          tone: "neutral",
        },
        {
          label: "Still open",
          value: count(open.length),
          tone: open.length ? "warn" : "good",
          sub: raw.length
            ? `${pct((complete.length / raw.length) * 100, 0)} complete`
            : undefined,
        },
        {
          label: "Open over a month",
          value: count(openOver30.length),
          tone: openOver30.length ? "bad" : "good",
          lowerIsBetter: true,
        },
        {
          label: "Extra repeated lines",
          value: count(repeatedLines),
          tone: repeatedLines > 0 ? "warn" : "good",
          lowerIsBetter: true,
          sub:
            repeatedOrders > 0
              ? `across ${count(repeatedOrders)} orders`
              : "none to check",
        },
        {
          label: "Largest customer",
          value: conc.topShare !== null ? pct(conc.topShare) : "—",
          tone:
            conc.topShare !== null && conc.topShare > 20 ? "warn" : "neutral",
          sub: conc.topLabel ?? undefined,
        },
      ],
      trend: {
        title: "How much was ordered each month",
        valueLabel: "Order value",
        points: t.points,
        averageLabel: "Average month in this period",
      },
      matrix: matrixFrom(
        raw.map((r) => ({
          label: r.party_name?.trim() || "Not recorded",
          month: (r.order_date ?? "").slice(0, 7),
          value: n(r.value),
        })),
        {
          title: "Which customers ordered, and when",
          format: "money",
          display: inrShort,
          note: "A pale month is a quiet one.",
        },
      ),
      panels: [
        {
          title: "Where the money came from",
          valueLabel: "Value",
          note: "The biggest customers in this period.",
          rows: rank(
            [...byParty].map(([label, value]) => ({
              label,
              value,
              meta: `${partyOrders.get(label) ?? 0} orders`,
            })),
            inrShort,
          ),
        },
        {
          title: "How much of it is a few names",
          valueLabel: "Value",
          kind: "share",
          rows: rank(
            [...byParty].map(([label, value]) => ({ label, value })),
            inrShort,
            5,
          ),
          note: "A wide first block means the business leans on a few customers.",
        },
        {
          title: "Which agents brought it in",
          valueLabel: "Value",
          rows: rank(
            [...byAgent].map(([label, value]) => ({ label, value })),
            inrShort,
          ),
        },
        {
          title: "How long the finished orders took",
          valueLabel: "Orders",
          tone: "severity",
          fixedCategories: true,
          rows: LEAD_BANDS.map((b) => {
            const v = leadDays.filter((d) => leadBandOf(d) === b.label).length;
            return {
              label: b.label,
              value: v,
              display: count(v),
              share: leadDays.length ? (v / leadDays.length) * 100 : 0,
            };
          }),
          note: "Order date to Received LR, for the orders that have finished. Open orders are not in this chart — they have no lead time yet.",
        },
        {
          // ── THE MONEY WAITING, NOT THE NUMBER OF ORDERS WAITING ────────
          //
          // This counted orders. "42 orders over 60 days" is a fact nobody
          // acts on; the rupees inside them is a fact somebody does — and
          // the two do not rank the same way, because the oldest bucket is
          // not usually the biggest one. The ageing HELPER still decides
          // the buckets and the severity ramp, so the bands match the Age
          // column on the Data sheet exactly; only what is summed changed.
          ...(() => {
            const base = ageing(open.map((r) => n(r.days_open)));
            const byBucket = new Map<string, number>();
            for (const r of open) {
              const b = bucketOf(n(r.days_open));
              byBucket.set(b, (byBucket.get(b) ?? 0) + n(r.value));
            }
            const openCount = new Map<string, number>();
            for (const r of open) {
              const b = bucketOf(n(r.days_open));
              openCount.set(b, (openCount.get(b) ?? 0) + 1);
            }
            return {
              ...base,
              rows: base.rows.map((row) => {
                const v = byBucket.get(row.label) ?? 0;
                return {
                  ...row,
                  value: v,
                  display: inrShort(v),
                  share: openValue > 0 ? (v / openValue) * 100 : 0,
                  meta: `${count(openCount.get(row.label) ?? 0)} orders`,
                };
              }),
            };
          })(),
          title: "What the open money is waiting on",
          valueLabel: "Value",
          note: "Value still to deliver, by how long the order has been open. Counted from the order date, which is what the customer is experiencing.",
        },
        {
          title: "How far the orders have got",
          valueLabel: "Orders",
          kind: "funnel",
          // In STAGE order, not by size. A funnel drawn from a ranked list
          // indents Received LR above Challan and reads as a descent that goes
          // backwards — these are resting places along a fixed path.
          rows: STAGE_ORDER.map((label) => ({
            label,
            value: byStage.get(label) ?? 0,
            display: count(byStage.get(label) ?? 0),
            share: raw.length
              ? ((byStage.get(label) ?? 0) / raw.length) * 100
              : 0,
          })).filter((x) => x.value > 0),
          note: "Where each order is resting. An order counts as past a stage only once every line of it is.",
        },
      ],
      insights,
      caveats,
      // ── FIVE PIVOTS, ONE PER QUESTION ────────────────────────────────
      //
      // Every field used here was checked against the live data first, and
      // five of this report's own columns were REJECTED as slicers because
      // they are empty in practice: `haste` (337 of 350 blank), `lot_no`
      // and `challan_no` (350 of 350), `department` (one value) and
      // `created_by` (two). A slicer that lists nothing teaches people the
      // filters do not work. `transport` is kept despite 85 blanks — a
      // quarter missing still leaves three quarters answerable.
      pivots: {
        extraFields: [
          {
            name: "Month",
            values: capped.map((r) => {
              const d = r.order_date?.slice(0, 10);
              if (!d) return null;
              const m = Number(d.slice(5, 7));
              return Number.isInteger(m) && m >= 1 && m <= 12
                ? `${MONTH_NAMES[m - 1]} ${d.slice(0, 4)}`
                : null;
            }),
          },
          {
            name: "Year",
            values: capped.map((r) => r.order_date?.slice(0, 4) ?? null),
          },
        ],
        tables: [
          {
            // THE BOTTLENECK GRID. Where the old money actually is: stage
            // down, age across, value inside. The two ageing panels say
            // how much is late and the funnel says where orders rest;
            // neither crosses the two, which is the question — "that
            // 31-60 day money, which stage is holding it?"
            rowFields: ["stage"],
            colField: "age_bucket",
            dataFields: [{ field: "value", label: "Sum of value" }],
            slicerFields: ["agent", "sales_person", "is_complete", "size_band"],
            sheetName: "Pivot - Bottleneck",
            pivotTableName: "StageByAge",
          },
          {
            // Each agent's book, opened up customer by customer.
            rowFields: ["agent", "party_name"],
            dataFields: [
              { field: "value", label: "Sum of value" },
              { field: "qty_mtr", label: "Sum of metres" },
            ],
            slicerFields: ["sales_person", "stage", "Month", "size_band"],
            sheetName: "Pivot - Agent",
            pivotTableName: "AgentBook",
          },
          {
            // Who ordered, and when — the sliceable version of the month
            // grid on the dashboard, which is capped and cannot be filtered.
            rowFields: ["party_name"],
            colField: "Month",
            dataFields: [{ field: "value", label: "Sum of value" }],
            slicerFields: ["agent", "sales_person", "stage", "size_band"],
            sheetName: "Pivot - Customer month",
            pivotTableName: "CustomerByMonth",
          },
          {
            // The sales hierarchy: 19 sales people over 74 agents.
            rowFields: ["sales_person", "agent"],
            dataFields: [
              { field: "value", label: "Sum of value" },
              { field: "live_lines", label: "Sum of lines" },
            ],
            slicerFields: ["stage", "Month", "size_band", "is_complete"],
            sheetName: "Pivot - Sales person",
            pivotTableName: "SalesRollup",
          },
          {
            // Do big orders move slower? Size against where it has reached.
            rowFields: ["size_band"],
            colField: "stage",
            dataFields: [{ field: "value", label: "Sum of value" }],
            slicerFields: ["agent", "sales_person", "Month", "age_bucket"],
            sheetName: "Pivot - Order size",
            pivotTableName: "SizeByStage",
          },
          {
            rowFields: ["party_name"],
            dataFields: [
              { field: "value" },
              { field: "qty_mtr", label: "Sum of metres" },
            ],
            slicerFields: ["agent", "sales_person", "stage", "transport"],
            sheetName: "Pivot - Orders",
            pivotTableName: "OrdersByParty",
          },
        ],
      },
    },
  };
}

export const orderRegister: ReportDefinition = {
  id: "order-entry.order-register",
  module: "order-entry",
  title: "Order register",
  description:
    "Every order at header level — party, agent, sales person, transport, how many lines, how many metres, what it is worth, and where it has reached.",
  defaultMonthsBack: 3,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 32 },
    { key: "agent", label: "Agent", type: "text", width: 22 },
    { key: "sales_person", label: "Sales person", type: "text", width: 18 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "haste", label: "Haste", type: "text", width: 12 },
    {
      key: "stage",
      label: "Reached",
      type: "text",
      width: 17,
      // Only "Not started" is coloured. A stage name is not good or bad —
      // an order at Challan is not doing worse than one at Bill — but an
      // order with NOTHING ticked is the one somebody has to chase.
      // Grey for the cancelled ones, not amber: they are settled, and an
      // amber cell is an instruction to go and chase somebody.
      badge: { "Not started": "warn", [NOTHING_LIVE]: "neutral" },
      note: "The furthest stage EVERY live line of this order has finished. One line still at stock checking holds the whole order there — which is what the customer experiences.",
    },
    {
      key: "furthest_line",
      label: "Furthest line",
      type: "text",
      width: 17,
      note: "The furthest stage ANY line has finished, for the other reading.",
    },
    {
      key: "is_complete",
      label: "Complete",
      type: "boolean",
      // Finished is worth seeing; still open is the ordinary state of a
      // live book (264 of 337) and tinting it would colour the page.
      badge: { Yes: "good" },
      note: "Every live line has finished its last stage. The Age column beside it is what says whether an unfinished one is late.",
    },
    {
      key: "days_open",
      label: "Days open",
      type: "int",
      total: "avg",
      note: "From the order date to today. The foot shows the average age, not a sum.",
    },
    {
      key: "age_bucket",
      label: "Age",
      type: "text",
      width: 13,
      badge: {
        "0\u20137 days": "good",
        "8\u201315 days": "good",
        "16\u201330 days": "warn",
        "31\u201360 days": "warn",
        "Over 60 days": "bad",
      },
    },
    {
      key: "live_lines",
      label: "Lines",
      type: "int",
      note: "Cancelled lines excluded, the same as Metres and Value beside it. The cancelled ones are counted in their own column.",
    },
    { key: "finished_lines", label: "Lines finished", type: "int" },
    {
      key: "held_lines",
      label: "Lines on hold",
      type: "int",
      note: "A held line is not counted as finished, whatever stages it has ticked.",
    },
    {
      key: "lines_through",
      label: "Lines through",
      type: "percent",
      total: "avg",
      // WEIGHTED BY THE LINES, because this is a RATIO. Unweighted, a
      // one-line order that finished counts as much as a forty-line order
      // that did not: the foot read 33.07% where finished-over-live is
      // 32.71%. Small here and the same class of error as the "Avg order"
      // mean-of-means that read 24% low.
      avgWeightBy: "live_lines",
      note: "How much of this order has finished.",
    },
    {
      key: "days_since_move",
      label: "Days since move",
      type: "number",
      total: "avg",
      note: "Since the last stage was ticked. Blank when nothing has ever been ticked.",
    },
    { key: "last_tick", label: "Last ticked", type: "datetime" },
    // ── DELIVERY: did it arrive, and was it on time ──────────────────────
    //
    // All three are blank until the order actually finishes. A half-done
    // order has no lead time, and filling one in from today's date would
    // drag every average towards "fast" using orders that have not arrived.
    {
      key: "lead_days",
      label: "Days to finish",
      type: "int",
      total: "avg",
      note: "Order date to the day Received LR was ticked. Blank while the order is still open — an unfinished order has no lead time yet, and counting one would understate the average. The foot is the average of the finished ones.",
    },
    {
      key: "due_on",
      label: "Due on",
      type: "date",
      note: "When the last stage was planned for, generated from the order date and the stage offsets in Time tracking. It is a target, not a promise made to the customer.",
    },
    {
      key: "on_time",
      label: "On time",
      type: "boolean",
      // The exception is being LATE, so only No is tinted. Tinting Yes as
      // well would colour most of the column on a book that runs late.
      badge: { No: "bad" },
      note: "Whether Received LR was ticked on or before Due on. Blank while the order is open. Measured against the generated target above, so it says as much about the offsets as about the mill — see the caveat.",
    },
    {
      key: "size_band",
      label: "Order size",
      type: "text",
      width: 14,
      note: "Which value band this order falls in. The bands are this book's own quartiles, so each holds a real share of the orders.",
    },
    { key: "cancelled_lines", label: "Cancelled lines", type: "int" },
    {
      key: "quality_names",
      label: "Fabrics",
      type: "text",
      width: 34,
      note: "The fabrics on this order, comma separated — the same list the Orders screen shows. Cancelled lines are left out, so it matches the count beside it.",
    },
    {
      key: "qualities",
      label: "Fabric count",
      type: "int",
      total: "none",
      note: "How many distinct fabrics that is. Not added up at the foot — the same fabric on two orders is one fabric.",
    },
    {
      key: "designs",
      label: "Designs",
      type: "int",
      total: "none",
      note: "Distinct designs on this order. Not added up, for the same reason.",
    },
    {
      key: "repeated_lines",
      label: "Extra lines",
      type: "int",
      note: "How many EXTRA lines repeat a fabric and design already on this order — a pair counts as one. Line detail flags both members instead, so the same repeats read 29 here and 58 there. Allowed on purpose: the same fabric and design can go at two rates or for two lots, and the order's totals are right either way.",
    },
    {
      key: "qty_mtr",
      label: "Metres",
      type: "number",
      unit: "MTR",
      note: "Cancelled lines excluded.",
    },
    {
      key: "value",
      label: "Value",
      type: "money",
      note: "Cancelled lines excluded — what should actually be delivered.",
    },
    {
      key: "avg_rate",
      label: "Avg rate",
      type: "money",
      total: "avg",
      avgWeightBy: "qty_mtr",
      note: "Value divided by metres, for this order. The foot shows the rate across the whole file, weighted by metres.",
    },
    { key: "cancelled_value", label: "Cancelled value", type: "money" },
    { key: "lot_no", label: "Lot no", type: "text", width: 14 },
    { key: "challan_no", label: "Challan no", type: "text", width: 14 },
    {
      key: "in_crr",
      label: "In CRR",
      type: "boolean",
      note: "Whether this customer is matched to the CRR customer master.",
    },
    { key: "remarks", label: "Remarks", type: "text", width: 34 },
    { key: "created_by", label: "Entered by", type: "text", width: 22 },
    { key: "created_at", label: "Entered at", type: "datetime" },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    {
      key: "party",
      label: "Party",
      kind: "select",
      options: () => distinctValues("party_name"),
    },
    {
      key: "agent",
      label: "Agent",
      kind: "select",
      options: () => distinctValues("agent"),
    },
    {
      key: "salesPerson",
      label: "Sales person",
      kind: "select",
      options: () => distinctValues("sales_person"),
    },
  ],
  run,
};
