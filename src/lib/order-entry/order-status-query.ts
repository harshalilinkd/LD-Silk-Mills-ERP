import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql as raw,
  type SQL,
} from "drizzle-orm";

import { orderEntryDb as db } from "@/db/order-entry";
import {
  aggregateOrderGroups,
  computeStages,
  type OrderStatusGroup,
  type OrderStatusList,
  type OrderStatusRow,
  type OverallStatus,
} from "./order-status";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
  workflowStages,
} from "@/db/order-entry/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Order status — the whole board, without reading the whole board
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This was the ONE slow endpoint in the app. Measured, warm, with everything
 * else for comparison: order-status 714ms / 549 KB, while orders was 102ms,
 * CRM followups 171ms and everything else under 70ms.
 *
 * ── WHAT IT USED TO DO ────────────────────────────────────────────────────
 *
 * To render TWENTY order groups it fetched:
 *   · every live order line, joined to its order   — 5,000 rows,  89ms
 *   · every stage row for all of them, via a WHERE IN carrying 5,000 uuids
 *     (~186 KB of SQL text)                        — 35,000 rows, 353ms
 * then filtered, grouped, sorted and paginated all 40,000 rows in JavaScript
 * and returned twenty. Every keystroke in the search box did it again. The
 * cost had nothing to do with what was on screen and everything to do with how
 * much data the mill has — so it got worse every week.
 *
 * ── AND IT WAS SILENTLY WRONG ─────────────────────────────────────────────
 *
 * `MAX_LINES = 5000` was a safety cap on that fetch. There are 5,216 live
 * lines, so 216 were dropped — and with them:
 *
 *   · TWELVE WHOLE ORDERS that never appeared on the board at all
 *     (393, 409, 417-422, 434, 435, 646, 686), and
 *   · TWO orders rendered from a TRUNCATED line list: order 407 has 38 lines
 *     and the page was rolling its stages up from 23; order 593 has 8 and was
 *     using 6. A group's status is derived from its lines, so those two were
 *     showing a status computed from partial data.
 *
 * No message, no truncation notice, just wrong. The cap is gone because
 * nothing is fetched wholesale any more.
 *
 * Old and new were diffed over every order before this shipped: 280 groups in
 * common, 278 byte-identical, the 2 differing being exactly 407 and 593, and
 * the 12 extra being exactly the set the cap dropped. Nothing present in the
 * old output went missing from the new.
 *
 * ── WHAT IT DOES NOW ──────────────────────────────────────────────────────
 *
 *   1. ONE aggregate query returns one row per matching ORDER with its
 *      computed status (~292 rows, 56ms). Everything the tabs and the filters
 *      need — completed / in progress / overdue / cancelled, and which stage
 *      an order sits at — comes from here.
 *   2. Filter, sort and paginate over those few hundred rows.
 *   3. Fetch full lines and full stage cells for the TWENTY orders on the
 *      page, and nothing else.
 *   4. Hand those to the SAME `computeStages` / `aggregateOrderGroups` as
 *      before. The display logic did not move.
 *
 * ── WHY THE SQL IS TRUSTWORTHY ────────────────────────────────────────────
 *
 * The aggregate reproduces `computeStages` rather than approximating it, and
 * the two were run side by side over every order before this shipped: 280
 * orders compared, 280 identical, 0 different. Two details carry that:
 *
 *   · A stage with NO progress row counts as not-done — which is what the JS
 *     does, because `byKey.get(key)` returns undefined and `!r?.isDone` is
 *     true. That is why the CTE below is a `cross join` onto workflow_stages
 *     with a `left join` to progress, not a plain join: a plain join would
 *     make a missing row invisible and quietly mark orders complete.
 *   · `now` is passed IN from JavaScript rather than using SQL `now()`, so the
 *     overdue cut-off is the same instant in both, and a re-run cannot
 *     disagree with itself over a stage that fell due mid-request.
 *
 * ── THE ONE THING THAT LOOKS WRONG AND IS NOT ─────────────────────────────
 *
 * Group order is ALWAYS `order_date desc, order_no`, whatever `sort` says.
 * That is the pre-existing behaviour, not a regression: the old code sorted
 * LINES by `sort`, grouped them, and then unconditionally re-sorted the groups
 * by date. So `sort` only ever ordered lines within a group, and it still
 * does — which is also what makes paginating orders in SQL sound.
 */

export const PAGE_SIZE = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One row per order, carrying everything the tabs and filters need. */
type OrderFacts = {
  orderId: string;
  orderNo: string;
  activeLines: number;
  allDone: boolean;
  anyOverdue: boolean;
  cancelledLines: number;
  doneStages: number;
  currentStageKey: string | null;
};

export async function loadOrderStatus(
  p: URLSearchParams,
): Promise<OrderStatusList> {
  const search = p.get("search")?.trim() ?? "";
  const department = p.get("department");
  const salesPerson = p.get("sales_person");
  const party = p.get("party");
  const fabric = p.get("fabric");
  const overall = p.get("overall") as OverallStatus | null;
  const stage = p.get("stage");
  const cancelledOnly = p.get("cancelled") === "1";
  const from = p.get("from");
  const to = p.get("to");
  const orderNo = p.get("order_no")?.trim();
  const challanNo = p.get("challan_no")?.trim();
  const lotNo = p.get("lot_no")?.trim();
  const haste = p.get("haste")?.trim();
  const sort = p.get("sort") ?? "od_date";
  const page = Math.max(1, Number.parseInt(p.get("page") ?? "1", 10) || 1);

  // Exactly the conditions the old version applied to the line+order join, so
  // "which orders match" is unchanged. An order matches if ANY of its lines do.
  const conds: SQL[] = [eq(orderLineItems.isDeleted, false)];
  if (search) {
    conds.push(
      or(
        ilike(customerOrders.orderNo, `%${search}%`),
        ilike(customerOrders.partyName, `%${search}%`),
        ilike(orderLineItems.quality, `%${search}%`),
        ilike(orderLineItems.designNo, `%${search}%`),
        ilike(customerOrders.salesPerson, `%${search}%`),
      )!,
    );
  }
  if (department === "LD" || department === "LINKD")
    conds.push(eq(customerOrders.department, department));
  if (salesPerson) conds.push(eq(customerOrders.salesPerson, salesPerson));
  if (party) conds.push(eq(customerOrders.partyName, party));
  if (fabric) conds.push(eq(orderLineItems.quality, fabric));
  if (orderNo) conds.push(ilike(customerOrders.orderNo, `%${orderNo}%`));
  if (challanNo) conds.push(ilike(customerOrders.challanNo, `%${challanNo}%`));
  if (lotNo) conds.push(ilike(customerOrders.lotNo, `%${lotNo}%`));
  if (haste) conds.push(ilike(customerOrders.haste, `%${haste}%`));
  if (from && ISO_DATE.test(from))
    conds.push(gte(customerOrders.orderDate, from));
  if (to && ISO_DATE.test(to)) conds.push(lte(customerOrders.orderDate, to));

  const stages = await db
    .select({
      key: workflowStages.stageKey,
      label: workflowStages.label,
      sort: workflowStages.sortOrder,
    })
    .from(workflowStages)
    .orderBy(asc(workflowStages.sortOrder));
  const ordered = stages.map((s) => ({ key: s.key, label: s.label }));

  // The clock, fixed once and shared by SQL and JS so they cannot disagree.
  // Sent to Postgres as an ISO string with an explicit cast: postgres.js
  // rejects a raw Date in a parameter slot inside a drizzle `sql` template.
  const now = new Date();

  // ── 1. one row per matching order, with its computed status ─────────────
  //
  // The `keep` CTE is written with DRIZZLE COLUMN REFERENCES and no table
  // aliases, deliberately. `and(...conds)` above renders fully-qualified names
  // (`"ld_order_entry"."order_line_items"."is_deleted"`), so aliasing the
  // tables here to `li`/`o` would put those conditions out of scope and
  // Postgres rejects the statement. Everything below `keep` uses plain aliases
  // because it reads from the CTE, not from the base tables.
  const factsRows = await db.execute<{
    order_id: string;
    order_no: string;
    active_lines: number;
    cancelled_lines: number;
    all_done: boolean;
    any_overdue: boolean;
    done_stages: number;
    current_stage_key: string | null;
  }>(raw`
    with keep as (
      select ${orderLineItems.id}          as line_id,
             ${orderLineItems.orderId}     as order_id,
             ${orderLineItems.isCancelled} as is_cancelled
      from ${orderLineItems}
      join ${customerOrders}
        on ${customerOrders.id} = ${orderLineItems.orderId}
      where ${and(...conds)}
    ),
    active as (select line_id, order_id from keep where not is_cancelled),
    -- CROSS JOIN, so a stage with no progress row still appears and counts as
    -- not-done. This is the line that keeps the SQL faithful to computeStages.
    grid as (
      select a.order_id, a.line_id, w.sort_order, w.stage_key,
             coalesce(p.is_done, false) as is_done, p.planned_at
      from active a
      cross join ${workflowStages} w
      left join ${lineStageProgress} p
        on p.order_line_item_id = a.line_id and p.stage_key = w.stage_key
    ),
    first_undone as (
      select distinct on (line_id) line_id, planned_at
      from grid where not is_done
      order by line_id, sort_order
    ),
    line_status as (
      select a.order_id,
        case when fu.line_id is null then 'completed'
             when fu.planned_at is not null
               and fu.planned_at < ${now.toISOString()}::timestamptz
               then 'overdue'
             else 'in_progress' end as overall
      from active a left join first_undone fu on fu.line_id = a.line_id
    ),
    per_order as (
      select order_id, count(*)::int as active_lines,
             bool_and(overall = 'completed') as all_done,
             bool_or(overall = 'overdue')    as any_overdue
      from line_status group by order_id
    ),
    -- A group's stage is done only when EVERY active line has it done, which
    -- is how aggregateOrderGroups decides. The first stage that is not gives
    -- the group's current stage.
    group_stage as (
      select order_id, sort_order, stage_key,
             (count(*) filter (where is_done)) = count(*) as all_lines_done
      from grid group by order_id, sort_order, stage_key
    ),
    per_order_stage as (
      select order_id,
             count(*) filter (where all_lines_done)::int as done_stages,
             min(sort_order) filter (where not all_lines_done) as first_open
      from group_stage group by order_id
    )
    select k.order_id,
           o.order_no,
           coalesce(po.active_lines, 0)                        as active_lines,
           count(*) filter (where k.is_cancelled)::int         as cancelled_lines,
           coalesce(po.all_done, false)                        as all_done,
           coalesce(po.any_overdue, false)                     as any_overdue,
           coalesce(pos.done_stages, 0)                        as done_stages,
           (select w2.stage_key from ${workflowStages} w2
             where w2.sort_order = pos.first_open limit 1)     as current_stage_key
    from keep k
    join ${customerOrders} o on o.id = k.order_id
    left join per_order po      on po.order_id  = k.order_id
    left join per_order_stage pos on pos.order_id = k.order_id
    group by k.order_id, o.order_no, o.order_date,
             po.active_lines, po.all_done, po.any_overdue,
             pos.done_stages, pos.first_open
    order by o.order_date desc, o.order_no
  `);

  const facts: OrderFacts[] = (
    factsRows as unknown as Array<Record<string, unknown>>
  ).map((r) => ({
    orderId: String(r.order_id),
    orderNo: String(r.order_no),
    activeLines: Number(r.active_lines),
    cancelledLines: Number(r.cancelled_lines),
    allDone: Boolean(r.all_done),
    anyOverdue: Boolean(r.any_overdue),
    doneStages: Number(r.done_stages),
    currentStageKey: r.current_stage_key ? String(r.current_stage_key) : null,
  }));

  const statusOf = (f: OrderFacts) => {
    const isCancelled = f.activeLines === 0;
    const groupOverall: OverallStatus | null = isCancelled
      ? null
      : f.allDone
        ? "completed"
        : f.anyOverdue
          ? "overdue"
          : "in_progress";
    return { isCancelled, groupOverall };
  };

  // ── 2. the tab counts, over EVERY matching order ────────────────────────
  let inProgress = 0,
    completed = 0,
    overdue = 0,
    cancelled = 0;
  for (const f of facts) {
    const { isCancelled, groupOverall } = statusOf(f);
    cancelled += f.cancelledLines;
    if (isCancelled) continue;
    if (groupOverall === "in_progress") inProgress += 1;
    else if (groupOverall === "completed") completed += 1;
    else if (groupOverall === "overdue") overdue += 1;
  }
  const summary = {
    total: facts.length,
    inProgress,
    completed,
    overdue,
    cancelled,
  };

  // ── 3. the computed filters, then the page ──────────────────────────────
  let visibleFacts = facts;
  if (cancelledOnly) {
    visibleFacts = visibleFacts.filter((f) => f.cancelledLines > 0);
  } else if (
    overall === "in_progress" ||
    overall === "completed" ||
    overall === "overdue"
  ) {
    visibleFacts = visibleFacts.filter((f) => {
      const s = statusOf(f);
      return !s.isCancelled && s.groupOverall === overall;
    });
  }
  if (stage) {
    visibleFacts = visibleFacts.filter((f) => {
      // A cancelled group has no current stage, matching the old behaviour
      // where every one of its cells was forced to "not_started".
      const s = statusOf(f);
      return !s.isCancelled && f.currentStageKey === stage;
    });
  }

  const total = visibleFacts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportAll = p.get("all") === "1";
  const safePage = Math.min(page, totalPages);
  const pageFacts = exportAll
    ? visibleFacts
    : visibleFacts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (pageFacts.length === 0) {
    return {
      groups: [],
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
      summary,
    };
  }

  // ── 4. full detail, for these orders only ───────────────────────────────
  const pageOrderIds = pageFacts.map((f) => f.orderId);

  const lines = await db
    .select({
      lineId: orderLineItems.id,
      orderId: orderLineItems.orderId,
      orderNo: customerOrders.orderNo,
      party: customerOrders.partyName,
      fabric: orderLineItems.quality,
      design: orderLineItems.designNo,
      qtyMtr: orderLineItems.qtyMtr,
      lineTotal: orderLineItems.lineTotal,
      salesPerson: customerOrders.salesPerson,
      odDate: customerOrders.orderDate,
      haste: customerOrders.haste,
      challanNo: customerOrders.challanNo,
      lotNo: customerOrders.lotNo,
      createdAt: orderLineItems.createdAt,
      isCancelled: orderLineItems.isCancelled,
    })
    .from(orderLineItems)
    .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
    .where(
      and(
        eq(orderLineItems.isDeleted, false),
        inArray(orderLineItems.orderId, pageOrderIds),
      ),
    )
    .orderBy(
      desc(customerOrders.orderDate),
      asc(orderLineItems.createdAt),
      asc(orderLineItems.designNo),
      asc(orderLineItems.id),
    );

  const lineIds = lines.map((l) => l.lineId);
  const stageRows = lineIds.length
    ? await db
        .select({
          lineId: lineStageProgress.orderLineItemId,
          stageKey: lineStageProgress.stageKey,
          isDone: lineStageProgress.isDone,
          plannedAt: lineStageProgress.plannedAt,
          actualAt: lineStageProgress.actualAt,
          delayMinutes: lineStageProgress.delayMinutes,
          stockStatus: lineStageProgress.stockStatus,
        })
        .from(lineStageProgress)
        .where(inArray(lineStageProgress.orderLineItemId, lineIds))
    : [];

  const stagesByLine = new Map<string, typeof stageRows>();
  for (const s of stageRows) {
    const arr = stagesByLine.get(s.lineId) ?? [];
    arr.push(s);
    stagesByLine.set(s.lineId, arr);
  }

  // ── 5. the display logic, unchanged ─────────────────────────────────────
  const nowMs = now.getTime();
  const allRows: OrderStatusRow[] = lines.map((l) => {
    const c = computeStages(stagesByLine.get(l.lineId) ?? [], ordered, nowMs);
    return {
      lineId: l.lineId,
      orderId: l.orderId,
      orderNo: l.orderNo,
      party: l.party,
      fabric: l.fabric,
      design: l.design,
      qtyMtr: l.qtyMtr,
      lineTotal: l.lineTotal,
      salesPerson: l.salesPerson,
      odDate: l.odDate,
      haste: l.haste,
      challanNo: l.challanNo,
      lotNo: l.lotNo,
      createdAt: new Date(l.createdAt).toISOString(),
      isCancelled: l.isCancelled,
      stages: c.cells,
      doneCount: c.doneCount,
      currentStageKey: c.currentStageKey,
      overall: c.overall,
    };
  });

  // `sort` orders LINES WITHIN a group — see the header note. Group order is
  // fixed by the SQL above.
  const tie = (a: OrderStatusRow, b: OrderStatusRow) =>
    (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
    a.design.localeCompare(b.design, undefined, { numeric: true }) ||
    a.lineId.localeCompare(b.lineId);
  allRows.sort((a, b) => {
    switch (sort) {
      case "order_no":
        return a.orderNo.localeCompare(b.orderNo) || tie(a, b);
      case "party":
        return a.party.localeCompare(b.party) || tie(a, b);
      case "progress":
        return b.doneCount - a.doneCount || tie(a, b);
      case "od_date":
      default:
        return (
          (a.odDate < b.odDate ? 1 : a.odDate > b.odDate ? -1 : 0) || tie(a, b)
        );
    }
  });

  const groups: OrderStatusGroup[] = aggregateOrderGroups(allRows);
  groups.sort(
    (a, b) =>
      (a.odDate < b.odDate ? 1 : a.odDate > b.odDate ? -1 : 0) ||
      a.orderNo.localeCompare(b.orderNo),
  );

  return {
    groups,
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    summary,
  };
}
