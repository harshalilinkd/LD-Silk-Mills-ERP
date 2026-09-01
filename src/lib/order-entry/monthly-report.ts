// Ported near-verbatim from Order Entry's lib/monthly-report.ts.
import { and, count, eq, exists, sql } from "drizzle-orm";

import { orderEntryDb as db } from "@/db/order-entry";
import { monthOf, monthsBetween, type MonthKey } from "./months";
import type { Department } from "./dashboard";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
  workflowStages,
} from "@/db/order-entry/schema";

export type MonthlyRow = {
  month: MonthKey;
  orders: number;
  designs: number;
  cancelledDesigns: number;
  qtyMtr: number;
  value: number;
  completedOrders: number;
  partiallyOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
};

export type MonthlyReport = {
  since: {
    firstOrderDate: string | null;
    firstEnteredAt: string | null;
    ordersTotal: number;
  };
  months: MonthlyRow[];
};

const stageCount = () =>
  sql`coalesce(nullif((select count(*) from ${workflowStages}), 0), 7)`;

export async function loadMonthlyReport(
  department: Department = "ALL",
): Promise<MonthlyReport> {
  const deptCond =
    department === "ALL"
      ? undefined
      : eq(customerOrders.department, department);
  const notDeleted = eq(orderLineItems.isDeleted, false);
  const active = and(eq(orderLineItems.isCancelled, false), notDeleted);
  const month = sql<string>`to_char(${customerOrders.orderDate}, 'YYYY-MM')`;
  const hasVisibleLine = exists(
    db
      .select({ one: sql`1` })
      .from(orderLineItems)
      .where(
        and(
          eq(orderLineItems.orderId, customerOrders.id),
          eq(orderLineItems.isDeleted, false),
        ),
      ),
  );

  const lineAgg = db
    .select({
      orderId: orderLineItems.orderId,
      month: month.as("month"),
      doneCount:
        sql<number>`count(*) filter (where ${lineStageProgress.isDone})`.as(
          "done_count",
        ),
    })
    .from(orderLineItems)
    .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
    .innerJoin(
      lineStageProgress,
      eq(lineStageProgress.orderLineItemId, orderLineItems.id),
    )
    .where(and(deptCond, active))
    .groupBy(orderLineItems.id, customerOrders.orderDate)
    .as("line_agg");

  const orderAgg = db
    .select({
      month: lineAgg.month,
      orderId: lineAgg.orderId,
      lines: count().as("lines"),
      completed:
        sql<number>`count(*) filter (where ${lineAgg.doneCount} >= ${stageCount()})`.as(
          "completed",
        ),
      started: sql<number>`count(*) filter (where ${lineAgg.doneCount} > 0)`.as(
        "started",
      ),
    })
    .from(lineAgg)
    .groupBy(lineAgg.month, lineAgg.orderId)
    .as("order_agg");

  const cancelPerOrder = db
    .select({
      month: month.as("month"),
      total: sql<number>`count(*) filter (where ${orderLineItems.isDeleted} = false)`.as(
        "total",
      ),
      cancelled:
        sql<number>`count(*) filter (where ${orderLineItems.isCancelled} and ${orderLineItems.isDeleted} = false)`.as(
          "cancelled",
        ),
    })
    .from(customerOrders)
    .innerJoin(orderLineItems, eq(orderLineItems.orderId, customerOrders.id))
    .where(deptCond)
    .groupBy(customerOrders.id, customerOrders.orderDate)
    .as("cancel_per_order");

  const [totals, statuses, cancelled, since] = await Promise.all([
    db
      .select({
        month,
        orders: sql<number>`count(distinct ${customerOrders.id}) filter (where ${orderLineItems.isDeleted} = false)`,
        designs: sql<number>`count(*) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false)`,
        cancelledDesigns: sql<number>`count(*) filter (where ${orderLineItems.isCancelled} and ${orderLineItems.isDeleted} = false)`,
        qtyMtr: sql<string>`coalesce(sum(${orderLineItems.qtyMtr}) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false), 0)`,
        value: sql<string>`coalesce(sum(${orderLineItems.lineTotal}) filter (where ${orderLineItems.isCancelled} = false and ${orderLineItems.isDeleted} = false), 0)`,
      })
      .from(customerOrders)
      .innerJoin(orderLineItems, eq(orderLineItems.orderId, customerOrders.id))
      .where(deptCond)
      .groupBy(month),

    db
      .select({
        month: orderAgg.month,
        completed: sql<number>`count(*) filter (where ${orderAgg.completed} = ${orderAgg.lines})`,
        pending: sql<number>`count(*) filter (where ${orderAgg.started} = 0)`,
        partially: sql<number>`count(*) filter (where ${orderAgg.started} > 0 and ${orderAgg.completed} < ${orderAgg.lines})`,
      })
      .from(orderAgg)
      .groupBy(orderAgg.month),

    db
      .select({
        month: cancelPerOrder.month,
        cancelledOrders: sql<number>`count(*) filter (where ${cancelPerOrder.total} > 0 and ${cancelPerOrder.cancelled} = ${cancelPerOrder.total})`,
      })
      .from(cancelPerOrder)
      .groupBy(cancelPerOrder.month),

    db
      .select({
        firstOrderDate: sql<string | null>`min(${customerOrders.orderDate})`,
        firstEnteredAt: sql<string | null>`min(${customerOrders.createdAt})`,
        ordersTotal: count(),
      })
      .from(customerOrders)
      .where(and(deptCond, hasVisibleLine))
      .then((r) => r[0]),
  ]);

  const totalsBy = new Map(totals.map((r) => [r.month, r]));
  const statusBy = new Map(statuses.map((r) => [r.month, r]));
  const cancelledBy = new Map(cancelled.map((r) => [r.month, r]));

  const firstDate = since.firstOrderDate;
  const keys = firstDate
    ? monthsBetween(
        monthOf(String(firstDate).slice(0, 10)),
        monthOf(new Date().toISOString().slice(0, 10)),
      )
    : [];

  const months: MonthlyRow[] = keys.map((m) => {
    const t = totalsBy.get(m);
    const s = statusBy.get(m);
    return {
      month: m,
      orders: Number(t?.orders ?? 0),
      designs: Number(t?.designs ?? 0),
      cancelledDesigns: Number(t?.cancelledDesigns ?? 0),
      qtyMtr: Math.round(Number(t?.qtyMtr ?? 0) * 100) / 100,
      value: Math.round(Number(t?.value ?? 0) * 100) / 100,
      completedOrders: Number(s?.completed ?? 0),
      partiallyOrders: Number(s?.partially ?? 0),
      pendingOrders: Number(s?.pending ?? 0),
      cancelledOrders: Number(cancelledBy.get(m)?.cancelledOrders ?? 0),
    };
  });
  months.reverse();

  return {
    since: {
      firstOrderDate: firstDate ? String(firstDate).slice(0, 10) : null,
      firstEnteredAt: since.firstEnteredAt
        ? new Date(since.firstEnteredAt).toISOString()
        : null,
      ordersTotal: Number(since.ordersTotal),
    },
    months,
  };
}
