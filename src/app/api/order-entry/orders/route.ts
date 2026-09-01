// Ported near-verbatim from Order Entry's app/api/orders/route.ts.
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  isUniqueViolation,
  jsonData,
  jsonError,
  requireAnyCapability,
  requireCapability,
} from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import { firstZodError, orderPayloadSchema } from "@/lib/order-entry/validation";
import {
  PROGRESS_STAGE_KEYS_LIST,
  buildInitialStageRows,
  computeOrderStatus,
  isOrderCancelled,
  lineStatusFromCounts,
} from "@/lib/order-entry/workflow";
import {
  customerOrders,
  designDatabase,
  lineStageProgress,
  orderLineItems,
  workflowStages,
} from "@/db/order-entry/schema";

const dbx = db;

const PAGE_SIZE = 20;
const EXPORT_MAX = 5000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const guard = await requireAnyCapability(["orders.view", "operations.view"]);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = url.searchParams;
  const search = q.get("search")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(q.get("page") ?? "1", 10) || 1);
  const exportAll = q.get("all") === "1";

  const orderNo = q.get("order_no")?.trim() ?? "";
  const challanNo = q.get("challan_no")?.trim() ?? "";
  const lotNo = q.get("lot_no")?.trim() ?? "";
  const haste = q.get("haste")?.trim() ?? "";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";

  const searchFilter = search
    ? or(
        ilike(customerOrders.orderNo, `%${search}%`),
        ilike(customerOrders.partyName, `%${search}%`),
        ilike(customerOrders.challanNo, `%${search}%`),
        ilike(customerOrders.lotNo, `%${search}%`),
      )
    : undefined;
  const filter = and(
    searchFilter,
    orderNo ? ilike(customerOrders.orderNo, `%${orderNo}%`) : undefined,
    challanNo ? ilike(customerOrders.challanNo, `%${challanNo}%`) : undefined,
    lotNo ? ilike(customerOrders.lotNo, `%${lotNo}%`) : undefined,
    haste ? ilike(customerOrders.haste, `%${haste}%`) : undefined,
    ISO_DATE.test(from) ? gte(customerOrders.orderDate, from) : undefined,
    ISO_DATE.test(to) ? lte(customerOrders.orderDate, to) : undefined,
  );

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
  const visibleFilter = and(filter, hasVisibleLine);

  const listQuery = db
    .select()
    .from(customerOrders)
    .where(visibleFilter)
    .orderBy(desc(customerOrders.orderDate), desc(customerOrders.createdAt));

  const [totalRes, orders, cancelAgg] = await Promise.all([
    db.select({ value: count() }).from(customerOrders).where(visibleFilter),
    exportAll
      ? listQuery.limit(EXPORT_MAX)
      : listQuery.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db
      .select({
        orderId: orderLineItems.orderId,
        total: count(),
        cancelled: sql<number>`count(*) filter (where ${orderLineItems.isCancelled})`,
      })
      .from(orderLineItems)
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .where(and(filter, eq(orderLineItems.isDeleted, false)))
      .groupBy(orderLineItems.orderId),
  ]);
  const total = totalRes[0].value;

  let fullyCancelledOrders = 0;
  let ordersWithAnyCancelled = 0;
  let cancelledDesigns = 0;
  for (const r of cancelAgg) {
    const c = Number(r.cancelled);
    const t = Number(r.total);
    cancelledDesigns += c;
    if (c > 0) ordersWithAnyCancelled += 1;
    if (isOrderCancelled(t, c)) fullyCancelledOrders += 1;
  }

  const orderIds = orders.map((o) => o.id);
  const lines = orderIds.length
    ? await db
        .select({
          id: orderLineItems.id,
          orderId: orderLineItems.orderId,
          quality: orderLineItems.quality,
          qtyMtr: orderLineItems.qtyMtr,
          lineTotal: orderLineItems.lineTotal,
          isCancelled: orderLineItems.isCancelled,
        })
        .from(orderLineItems)
        .where(
          and(
            inArray(orderLineItems.orderId, orderIds),
            eq(orderLineItems.isDeleted, false),
          ),
        )
    : [];

  const lineIds = lines.map((l) => l.id);
  const statusRows = lineIds.length
    ? await db
        .select({
          lineId: lineStageProgress.orderLineItemId,
          stageRows: count(),
          doneRows: sql<number>`count(*) filter (where ${lineStageProgress.isDone})`,
          anyProgressStageDone: sql<boolean>`bool_or(${lineStageProgress.isDone} and ${inArray(lineStageProgress.stageKey, [...PROGRESS_STAGE_KEYS_LIST])})`,
        })
        .from(lineStageProgress)
        .where(inArray(lineStageProgress.orderLineItemId, lineIds))
        .groupBy(lineStageProgress.orderLineItemId)
    : [];

  const statusByLine = new Map(
    statusRows.map((s) => [
      s.lineId,
      lineStatusFromCounts({
        stageRows: Number(s.stageRows),
        doneRows: Number(s.doneRows),
        anyProgressStageDone: Boolean(s.anyProgressStageDone),
      }),
    ]),
  );
  const linesByOrder = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = linesByOrder.get(l.orderId) ?? [];
    arr.push(l);
    linesByOrder.set(l.orderId, arr);
  }

  const rows = orders.map((o) => {
    const all = linesByOrder.get(o.id) ?? [];
    const active = all.filter((l) => !l.isCancelled);
    const cancelledCount = all.length - active.length;
    const orderCancelled = isOrderCancelled(all.length, cancelledCount);
    const shown = orderCancelled ? all : active;
    const qtyTotal = shown.reduce((s, l) => s + Number(l.qtyMtr), 0);
    const grandTotal = shown.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);
    const fabrics = [...new Set(shown.map((l) => l.quality))];
    const lineStatuses = active.map((l) => statusByLine.get(l.id) ?? "PENDING");
    return {
      id: o.id,
      order_no: o.orderNo,
      order_date: o.orderDate,
      party_name: o.partyName,
      sales_person: o.salesPerson,
      agent: o.agent,
      haste: o.haste,
      challan_no: o.challanNo,
      lot_no: o.lotNo,
      department: o.department,
      fabrics,
      line_count: active.length,
      total_line_count: all.length,
      cancelled_line_count: cancelledCount,
      qty_total: Number(qtyTotal.toFixed(2)),
      grand_total: Number(grandTotal.toFixed(2)),
      operations_status: orderCancelled
        ? ("CANCELLED" as const)
        : computeOrderStatus(lineStatuses),
      created_at: o.createdAt,
    };
  });

  return jsonData({
    orders: rows,
    page,
    page_size: PAGE_SIZE,
    total,
    total_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: {
      fully_cancelled_orders: fullyCancelledOrders,
      orders_with_any_cancelled: ordersWithAnyCancelled,
      cancelled_designs: cancelledDesigns,
    },
  });
}

export async function POST(req: Request) {
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = orderPayloadSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodError(parsed.error), 422);

  const { order, fabrics } = parsed.data;
  const orderNo = order.order_no.trim();

  const [dup] = await db
    .select({ id: customerOrders.id })
    .from(customerOrders)
    .where(eq(customerOrders.orderNo, orderNo))
    .limit(1);
  if (dup) return jsonError(`Order number "${orderNo}" already exists.`, 409);

  try {
    const result = await dbx.transaction(async (tx) => {
      const [created] = await tx
        .insert(customerOrders)
        .values({
          orderNo,
          orderDate: order.order_date,
          partyName: order.party_name,
          salesPerson: order.sales_person,
          agent: order.agent,
          haste: order.haste,
          transport: order.transport,
          challanNo: order.challan_no,
          lotNo: order.lot_no,
          department: order.department?.trim() || "LD",
          remarks: order.remarks,
          createdBy: guard.user.email ?? guard.user.name ?? null,
        })
        .returning({ id: customerOrders.id });

      const orderId = created.id;
      const lineValues = fabrics.flatMap((f) =>
        f.designs.map((d) => ({
          orderId,
          quality: f.fabric.trim(),
          designNo: d.design_no.trim(),
          qtyMtr: String(d.qty_mtr),
          rate: f.rate == null ? null : String(f.rate),
        })),
      );

      const insertedLines = await tx
        .insert(orderLineItems)
        .values(lineValues)
        .returning({ id: orderLineItems.id });

      const offRows = await tx
        .select({
          stageKey: workflowStages.stageKey,
          off: workflowStages.plannedOffsetDays,
        })
        .from(workflowStages);
      const offsets = Object.fromEntries(offRows.map((r) => [r.stageKey, r.off]));

      const stageValues = insertedLines.flatMap((l) =>
        buildInitialStageRows(l.id, order.order_date, offsets),
      );
      await tx.insert(lineStageProgress).values(stageValues);

      const seen = new Set<string>();
      const designRows = lineValues.flatMap((lv) => {
        const key = `${lv.quality}__${lv.designNo}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            orderId,
            orderNo,
            fabricName: lv.quality,
            designNo: lv.designNo,
          },
        ];
      });
      if (designRows.length) {
        await tx.insert(designDatabase).values(designRows).onConflictDoNothing();
      }

      return { orderId, lineCount: insertedLines.length };
    });

    return jsonData(
      { id: result.orderId, order_no: orderNo, line_count: result.lineCount },
      201,
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      return jsonError(`Order number "${orderNo}" already exists.`, 409);
    }
    console.error("POST /api/order-entry/orders failed:", e);
    return jsonError("Failed to create order", 500);
  }
}
