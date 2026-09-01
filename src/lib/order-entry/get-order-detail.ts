// Shared by the order detail page (direct call, no HTTP round-trip) and
// GET /api/order-entry/orders/[id] (kept for parity / future client-side
// refetching, e.g. after an edit).
import { and, asc, eq, inArray } from "drizzle-orm";
import { orderEntryDb as db } from "@/db/order-entry";
import {
  computeLineStatus,
  computeOrderStatus,
  isOrderCancelled,
} from "./workflow";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
} from "@/db/order-entry/schema";
import type { OrderDetail } from "./orders";

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const [order] = await db
    .select()
    .from(customerOrders)
    .where(eq(customerOrders.id, id))
    .limit(1);
  if (!order) return null;

  const lines = await db
    .select()
    .from(orderLineItems)
    .where(and(eq(orderLineItems.orderId, id), eq(orderLineItems.isDeleted, false)))
    .orderBy(asc(orderLineItems.createdAt));

  const lineIds = lines.map((l) => l.id);
  const stages = lineIds.length
    ? await db
        .select({
          lineId: lineStageProgress.orderLineItemId,
          stageKey: lineStageProgress.stageKey,
          isDone: lineStageProgress.isDone,
        })
        .from(lineStageProgress)
        .where(inArray(lineStageProgress.orderLineItemId, lineIds))
    : [];

  const stagesByLine = new Map<string, { stageKey: string; isDone: boolean }[]>();
  for (const s of stages) {
    const arr = stagesByLine.get(s.lineId) ?? [];
    arr.push({ stageKey: s.stageKey, isDone: s.isDone });
    stagesByLine.set(s.lineId, arr);
  }

  const lineOut = lines.map((l) => ({
    id: l.id,
    quality: l.quality,
    design_no: l.designNo,
    qty_mtr: l.qtyMtr,
    rate: l.rate,
    line_total: l.lineTotal,
    is_cancelled: l.isCancelled,
    operations_status: computeLineStatus(stagesByLine.get(l.id) ?? []),
  }));

  const fabricMap = new Map<
    string,
    { fabric: string; rate: number | null; designs: { design_no: string; qty_mtr: number }[] }
  >();
  for (const l of lines) {
    const key = `${l.quality}__${l.rate ?? ""}`;
    let block = fabricMap.get(key);
    if (!block) {
      block = { fabric: l.quality, rate: l.rate == null ? null : Number(l.rate), designs: [] };
      fabricMap.set(key, block);
    }
    block.designs.push({ design_no: l.designNo, qty_mtr: Number(l.qtyMtr) });
  }

  const active = lineOut.filter((l) => !l.is_cancelled);
  const cancelledLines = lineOut.length - active.length;
  const orderCancelled = isOrderCancelled(lineOut.length, cancelledLines);
  const shown = orderCancelled ? lineOut : active;
  const qty_total = shown.reduce((s, l) => s + Number(l.qty_mtr), 0);
  const grand_total = shown.reduce((s, l) => s + Number(l.line_total ?? 0), 0);

  return {
    order: {
      id: order.id,
      order_no: order.orderNo,
      order_date: order.orderDate,
      party_name: order.partyName,
      sales_person: order.salesPerson,
      agent: order.agent,
      haste: order.haste,
      transport: order.transport,
      challan_no: order.challanNo,
      lot_no: order.lotNo,
      department: order.department,
      remarks: order.remarks,
      created_by: order.createdBy,
      created_at: order.createdAt as unknown as string,
      updated_at: order.updatedAt as unknown as string,
    },
    fabrics: [...fabricMap.values()],
    lines: lineOut,
    qty_total: Number(qty_total.toFixed(2)),
    grand_total: Number(grand_total.toFixed(2)),
    operations_status: orderCancelled
      ? "CANCELLED"
      : computeOrderStatus(active.map((l) => l.operations_status)),
    is_order_cancelled: orderCancelled,
    total_line_count: lineOut.length,
    cancelled_line_count: cancelledLines,
  };
}
