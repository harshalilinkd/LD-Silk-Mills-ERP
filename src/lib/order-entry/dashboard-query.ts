// Ported near-verbatim from Order Entry's lib/dashboard-query.ts. Only the
// imports changed (this repo's paths); the aggregation logic, the deliberate
// "batch queries to fit the 5-connection pool" comment, and the SQL itself
// are unchanged — same live tables, same rules (soft-delete/cancel handling,
// department filter, trend/pipeline/overdue math).
import { and, asc, count, desc, eq, gte, lt, lte, sql } from "drizzle-orm";

import { orderEntryDb as db } from "@/db/order-entry";
import { dayCount, type DashboardData, type Department } from "./dashboard";
import type { OperationsStatus } from "./orders";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
  workflowStages,
} from "@/db/order-entry/schema";

export type DashboardParams = {
  from: string;
  to: string;
  department: Department;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateStr(value: string | null, fallback: string): string {
  const v = (value ?? "").slice(0, 10);
  return ISO_DATE.test(v) ? v : fallback;
}

export function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dashboardParams(raw: {
  from?: string | null;
  to?: string | null;
  department?: string | null;
}): DashboardParams {
  const today = new Date().toISOString().slice(0, 10);
  const dept = raw.department;
  return {
    from: dateStr(raw.from ?? null, shiftDays(today, -29)),
    to: dateStr(raw.to ?? null, today),
    department: dept === "LD" || dept === "LINKD" ? dept : "ALL",
  };
}

const stageCount = () =>
  sql`coalesce(nullif((select count(*) from ${workflowStages}), 0), 7)`;

export async function loadDashboard({
  from,
  to,
  department,
}: DashboardParams): Promise<DashboardData> {
  const now = new Date();

  const deptCond =
    department === "ALL"
      ? undefined
      : eq(customerOrders.department, department);
  const rangeWhere = (f: string, t: string) =>
    and(
      gte(customerOrders.orderDate, f),
      lte(customerOrders.orderDate, t),
      deptCond,
    );
  const orderWhere = rangeWhere(from, to);

  const notDeletedLine = eq(orderLineItems.isDeleted, false);
  const activeLine = and(eq(orderLineItems.isCancelled, false), notDeletedLine);

  const len = dayCount(from, to);
  const prevTo = shiftDays(from, -1);
  const prevFrom = shiftDays(prevTo, -(len - 1));

  const lineAggCte = () =>
    db.$with("line_agg").as(
      db
        .select({
          orderId: orderLineItems.orderId,
          lineTotal: orderLineItems.lineTotal,
          doneCount: sql<number>`count(*) filter (where ${lineStageProgress.isDone})`.as(
            "done_count",
          ),
          currentSort: sql<
            number | null
          >`min(${workflowStages.sortOrder}) filter (where ${lineStageProgress.isDone} = false)`.as(
            "current_sort",
          ),
        })
        .from(orderLineItems)
        .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
        .innerJoin(
          lineStageProgress,
          eq(lineStageProgress.orderLineItemId, orderLineItems.id),
        )
        .innerJoin(
          workflowStages,
          eq(workflowStages.stageKey, lineStageProgress.stageKey),
        )
        .where(and(orderWhere, activeLine))
        .groupBy(orderLineItems.id),
    );

  function pipelineQuery() {
    const la = lineAggCte();
    return db
      .with(la)
      .select({ sort: la.currentSort, n: count() })
      .from(la)
      .where(sql`${la.currentSort} is not null`)
      .groupBy(la.currentSort);
  }

  function orderRollupQuery() {
    const la = lineAggCte();
    return db
      .with(la)
      .select({
        id: la.orderId,
        orderNo: customerOrders.orderNo,
        party: customerOrders.partyName,
        orderDate: customerOrders.orderDate,
        value: sql<string>`coalesce(sum(${la.lineTotal}), 0)`,
        lines: count(),
        completed: sql<number>`count(*) filter (where ${la.doneCount} >= ${stageCount()})`,
        started: sql<number>`count(*) filter (where ${la.doneCount} > 0)`,
      })
      .from(la)
      .innerJoin(customerOrders, eq(customerOrders.id, la.orderId))
      .groupBy(
        la.orderId,
        customerOrders.orderNo,
        customerOrders.partyName,
        customerOrders.orderDate,
      );
  }

  const overdueAgg = db.$with("overdue_agg").as(
    db
      .select({
        orderId: customerOrders.id,
        orderNo: customerOrders.orderNo,
        party: customerOrders.partyName,
        label: workflowStages.label,
        plannedAt: lineStageProgress.plannedAt,
        rn: sql<number>`row_number() over (partition by ${customerOrders.id} order by ${lineStageProgress.plannedAt} asc)`.as(
          "rn",
        ),
        total: sql<number>`count(*) over ()`.as("total"),
      })
      .from(lineStageProgress)
      .innerJoin(
        orderLineItems,
        eq(orderLineItems.id, lineStageProgress.orderLineItemId),
      )
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .innerJoin(
        workflowStages,
        eq(workflowStages.stageKey, lineStageProgress.stageKey),
      )
      .where(
        and(
          orderWhere,
          activeLine,
          eq(lineStageProgress.isDone, false),
          lt(lineStageProgress.plannedAt, now),
        ),
      ),
  );

  const cancelPerOrder = db.$with("cancel_per_order").as(
    db
      .select({
        orderId: orderLineItems.orderId,
        total: count().as("total"),
        cancelled:
          sql<number>`count(*) filter (where ${orderLineItems.isCancelled})`.as(
            "cancelled",
          ),
      })
      .from(orderLineItems)
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .where(and(orderWhere, notDeletedLine))
      .groupBy(orderLineItems.orderId),
  );

  const trashPerOrder = db.$with("trash_per_order").as(
    db
      .select({
        orderId: orderLineItems.orderId,
        total: count().as("total"),
        deleted:
          sql<number>`count(*) filter (where ${orderLineItems.isDeleted})`.as(
            "deleted",
          ),
      })
      .from(orderLineItems)
      .groupBy(orderLineItems.orderId),
  );

  // Fan out in waves — the shared connection pool caps at a handful of
  // connections, and firing more queries than that at Supavisor stalls the
  // request instead of failing (same reasoning as the source file).
  const [stages, pipelineRows, orderRows, otRes] = await Promise.all([
    db
      .select({
        key: workflowStages.stageKey,
        label: workflowStages.label,
        sort: workflowStages.sortOrder,
      })
      .from(workflowStages)
      .orderBy(asc(workflowStages.sortOrder)),

    pipelineQuery(),
    orderRollupQuery(),

    db
      .select({
        done: sql<number>`count(*)`,
        onTime: sql<number>`count(*) filter (where coalesce(${lineStageProgress.delayMinutes}, 0) <= 0)`,
      })
      .from(lineStageProgress)
      .innerJoin(
        orderLineItems,
        eq(orderLineItems.id, lineStageProgress.orderLineItemId),
      )
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .where(and(orderWhere, activeLine, eq(lineStageProgress.isDone, true)))
      .then((r) => r[0]),
  ]);

  const [byDay, prevRes, topPartiesRaw, topFabricsRaw] = await Promise.all([
    db
      .select({
        d: customerOrders.orderDate,
        n: sql<number>`count(distinct ${customerOrders.id}) filter (where ${orderLineItems.isDeleted} = false)`,
        v: sql<string>`coalesce(sum(${orderLineItems.lineTotal}) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false), 0)`,
        m: sql<string>`coalesce(sum(${orderLineItems.qtyMtr}) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false), 0)`,
      })
      .from(customerOrders)
      .innerJoin(orderLineItems, eq(orderLineItems.orderId, customerOrders.id))
      .where(orderWhere)
      .groupBy(customerOrders.orderDate),

    db
      .select({
        orders: sql<number>`count(distinct ${customerOrders.id}) filter (where ${orderLineItems.isDeleted} = false)`,
        value: sql<string>`coalesce(sum(${orderLineItems.lineTotal}) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false), 0)`,
        meters: sql<string>`coalesce(sum(${orderLineItems.qtyMtr}) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false), 0)`,
      })
      .from(customerOrders)
      .innerJoin(orderLineItems, eq(orderLineItems.orderId, customerOrders.id))
      .where(rangeWhere(prevFrom, prevTo))
      .then((r) => r[0]),

    db
      .select({
        party: customerOrders.partyName,
        orders: sql<number>`count(distinct ${customerOrders.id})`,
        value: sql<string>`coalesce(sum(${orderLineItems.lineTotal}), 0)`,
      })
      .from(orderLineItems)
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .where(and(orderWhere, activeLine))
      .groupBy(customerOrders.partyName)
      .orderBy(desc(sql`coalesce(sum(${orderLineItems.lineTotal}), 0)`))
      .limit(6),

    db
      .select({
        fabric: orderLineItems.quality,
        meters: sql<string>`coalesce(sum(${orderLineItems.qtyMtr}), 0)`,
      })
      .from(orderLineItems)
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .where(and(orderWhere, activeLine))
      .groupBy(orderLineItems.quality)
      .orderBy(desc(sql`coalesce(sum(${orderLineItems.qtyMtr}), 0)`))
      .limit(6),
  ]);

  const [overdueRows, cancelRes, trashRes] = await Promise.all([
    db
      .with(overdueAgg)
      .select({
        orderId: overdueAgg.orderId,
        orderNo: overdueAgg.orderNo,
        party: overdueAgg.party,
        label: overdueAgg.label,
        plannedAt: overdueAgg.plannedAt,
        total: overdueAgg.total,
      })
      .from(overdueAgg)
      .where(sql`${overdueAgg.rn} = 1`)
      .orderBy(asc(overdueAgg.plannedAt))
      .limit(10),

    db
      .with(cancelPerOrder)
      .select({
        designs: sql<string>`coalesce(sum(${cancelPerOrder.cancelled}), 0)`,
        ordersWith: sql<number>`count(*) filter (where ${cancelPerOrder.cancelled} > 0)`,
        ordersAll: sql<number>`count(*) filter (where ${cancelPerOrder.total} > 0 and ${cancelPerOrder.cancelled} = ${cancelPerOrder.total})`,
      })
      .from(cancelPerOrder)
      .then((r) => r[0]),

    db
      .with(trashPerOrder)
      .select({
        orders: sql<number>`count(*) filter (where ${trashPerOrder.total} > 0 and ${trashPerOrder.deleted} = ${trashPerOrder.total})`,
        designs: sql<string>`coalesce(sum(${trashPerOrder.deleted}) filter (where ${trashPerOrder.deleted} > 0 and ${trashPerOrder.deleted} <> ${trashPerOrder.total}), 0)`,
      })
      .from(trashPerOrder)
      .then((r) => r[0]),
  ]);

  const overdueStages = Number(overdueRows[0]?.total ?? 0);
  const doneStages = Number(otRes.done);
  const onTimeStages = Number(otRes.onTime);
  const onTimePct =
    doneStages === 0 ? 100 : Math.round((onTimeStages / doneStages) * 100);

  const pipelineCount = new Map<number, number>();
  for (const r of pipelineRows) {
    if (r.sort != null) pipelineCount.set(Number(r.sort), Number(r.n));
  }
  const pipeline = stages.map((s) => ({
    stageKey: s.key,
    label: s.label,
    sortOrder: s.sort,
    count: pipelineCount.get(s.sort) ?? 0,
  }));

  const orders = orderRows.map((o) => {
    const lines = Number(o.lines);
    const completed = Number(o.completed);
    const started = Number(o.started);
    const status: OperationsStatus =
      lines === 0 || started === 0
        ? "PENDING"
        : completed === lines
          ? "COMPLETED"
          : "PARTIALLY COMPLETED";
    return {
      id: o.id,
      orderNo: o.orderNo,
      party: o.party,
      orderDate: o.orderDate,
      value: Number(o.value),
      status,
    };
  });

  const completedOrders = orders.filter((o) => o.status === "COMPLETED").length;
  const activeOrders = orders.length - completedOrders;
  const cancelledOrders = Number(cancelRes.ordersAll);
  const statusBreakdown = {
    completed: completedOrders,
    partially: orders.filter((o) => o.status === "PARTIALLY COMPLETED").length,
    pending: orders.filter((o) => o.status === "PENDING").length,
    cancelled: cancelledOrders,
  };
  const recentOrders = [...orders]
    .sort((a, b) =>
      a.orderDate === b.orderDate
        ? b.orderNo.localeCompare(a.orderNo)
        : a.orderDate < b.orderDate
          ? 1
          : -1,
    )
    .slice(0, 8);

  const dayMap = new Map(byDay.map((r) => [r.d, r]));
  let curOrders = 0;
  let curValue = 0;
  let curMeters = 0;
  for (const r of byDay) {
    curOrders += Number(r.n);
    curValue += Number(r.v);
    curMeters += Number(r.m);
  }
  const money = (n: number) => Math.round(n * 100) / 100;
  curValue = money(curValue);
  curMeters = money(curMeters);
  const trend: { date: string; orders: number; value: number }[] = [];
  {
    let d = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    let guardN = 0;
    while (d <= end && guardN < 400) {
      const k = d.toISOString().slice(0, 10);
      const row = dayMap.get(k);
      trend.push({
        date: k,
        orders: row ? Number(row.n) : 0,
        value: row ? Number(row.v) : 0,
      });
      d = new Date(d);
      d.setUTCDate(d.getUTCDate() + 1);
      guardN += 1;
    }
  }

  const attention = overdueRows
    .filter((r) => r.plannedAt != null)
    .map((r) => ({
      orderId: r.orderId,
      orderNo: r.orderNo,
      party: r.party,
      stageLabel: r.label,
      daysOverdue: Math.floor(
        (now.getTime() - new Date(r.plannedAt as unknown as string).getTime()) /
          86_400_000,
      ),
    }));

  return {
    range: { from, to, department },
    kpis: {
      orders: curOrders,
      value: curValue,
      meters: curMeters,
      activeOrders,
      completedOrders,
      overdueStages,
      onTimePct,
      prev: {
        orders: Number(prevRes.orders),
        value: Number(prevRes.value),
        meters: Number(prevRes.meters),
      },
    },
    pipeline,
    statusBreakdown,
    delays: { onTime: onTimeStages, late: doneStages - onTimeStages },
    cancellation: {
      cancelledDesigns: Number(cancelRes.designs),
      ordersWithCancel: Number(cancelRes.ordersWith),
      cancelledOrders,
    },
    trash: {
      deletedDesigns: Number(trashRes.designs),
      deletedOrders: Number(trashRes.orders),
    },
    trend,
    topParties: topPartiesRaw.map((r) => ({
      party: r.party,
      orders: Number(r.orders),
      value: Number(r.value),
    })),
    topFabrics: topFabricsRaw.map((r) => ({
      fabric: r.fabric,
      meters: Number(r.meters),
    })),
    recentOrders,
    attention,
  };
}
