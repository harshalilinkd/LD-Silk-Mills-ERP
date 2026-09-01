import { and, eq } from "drizzle-orm";
import { jsonData, jsonError, requireCapability } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import { cancelOrderSchema, firstZodError } from "@/lib/order-entry/validation";
import { isOrderCancelled } from "@/lib/order-entry/workflow";
import { customerOrders, orderLineItems } from "@/db/order-entry/schema";

const dbx = db;
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = cancelOrderSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodError(parsed.error), 422);
  const { line_id, cancelled } = parsed.data;

  const [order] = await db
    .select({ id: customerOrders.id })
    .from(customerOrders)
    .where(eq(customerOrders.id, id))
    .limit(1);
  if (!order) return jsonError("Order not found", 404);

  if (line_id) {
    const [line] = await db
      .select({ id: orderLineItems.id })
      .from(orderLineItems)
      .where(and(eq(orderLineItems.id, line_id), eq(orderLineItems.orderId, id)))
      .limit(1);
    if (!line) return jsonError("Design not found on this order", 404);
  }

  const now = new Date();
  try {
    await dbx.transaction(async (tx) => {
      await tx
        .update(orderLineItems)
        .set({ isCancelled: cancelled, updatedAt: now })
        .where(
          line_id
            ? eq(orderLineItems.id, line_id)
            : eq(orderLineItems.orderId, id),
        );
      await tx
        .update(customerOrders)
        .set({ updatedAt: now })
        .where(eq(customerOrders.id, id));
    });
  } catch (e) {
    console.error("PATCH /api/order-entry/orders/[id]/cancel failed:", e);
    return jsonError("Failed to update cancellation", 500);
  }

  const lines = await db
    .select({ isCancelled: orderLineItems.isCancelled })
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, id));
  const total = lines.length;
  const cancelledLines = lines.filter((l) => l.isCancelled).length;

  return jsonData({
    id,
    line_id: line_id ?? null,
    cancelled,
    total_line_count: total,
    cancelled_line_count: cancelledLines,
    is_order_cancelled: isOrderCancelled(total, cancelledLines),
  });
}
