import { and, eq } from "drizzle-orm";
import { jsonData, jsonError, requireCapability } from "@/lib/order-entry/api";
import { auditOrderEntry, countLiveLines, snapshotOrder } from "@/lib/order-entry/audit";
import { orderEntryDb as db } from "@/db/order-entry";
import { deleteLineSchema, firstZodError } from "@/lib/order-entry/validation";
import { isOrderDeleted } from "@/lib/order-entry/workflow";
import { customerOrders, orderLineItems } from "@/db/order-entry/schema";

const dbx = db;
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = deleteLineSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodError(parsed.error), 422);
  const { line_id, deleted } = parsed.data;

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

  // ── BINNING IS RECORDED TOO, NOT JUST THE PERMANENT REMOVAL ──────────
  //
  // Permanently removing an order is only possible once its lines are in the
  // Trash, so this PATCH is step one of the two-step removal that lost orders
  // 1262/1264/1265. Recording only step two would name whoever pressed the
  // last button and miss whoever decided.
  //
  // A restore (`deleted: false`) is recorded as well: it is the same switch and
  // the interesting question is usually "who moved this, and when".
  const beforeLive = await countLiveLines(id);
  await auditOrderEntry({
    action: deleted ? "order-entry.order_binned" : "order-entry.order_restored",
    email: guard.user.email ?? null,
    metadata: {
      orderId: id,
      scope: line_id ? "one design" : "the whole order",
      lineId: line_id ?? null,
      liveLinesBefore: beforeLive,
      order: await snapshotOrder(id),
    },
  });

  const now = new Date();
  try {
    await dbx.transaction(async (tx) => {
      await tx
        .update(orderLineItems)
        .set({ isDeleted: deleted, updatedAt: now })
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
    console.error("PATCH /api/order-entry/orders/[id]/delete failed:", e);
    return jsonError("Failed to update deletion", 500);
  }

  const lines = await db
    .select({ isDeleted: orderLineItems.isDeleted })
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, id));
  const total = lines.length;
  const deletedLines = lines.filter((l) => l.isDeleted).length;

  return jsonData({
    id,
    line_id: line_id ?? null,
    deleted,
    total_line_count: total,
    deleted_line_count: deletedLines,
    visible_line_count: total - deletedLines,
    is_order_deleted: isOrderDeleted(total, deletedLines),
  });
}
