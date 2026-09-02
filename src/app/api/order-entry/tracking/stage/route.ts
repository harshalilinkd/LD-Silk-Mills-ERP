// Ported from Order Entry's app/api/tracking/stage/route.ts — only the import
// paths and the db handle changed.
import { eq } from "drizzle-orm";

import { jsonData, jsonError, requireCapability } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import {
  firstZodError,
  stageToggleSchema,
} from "@/lib/order-entry/validation";
import { applyStageProgress, WorkflowError } from "@/lib/order-entry/workflow";
import { orderLineItems } from "@/db/order-entry/schema";

// PATCH /api/order-entry/tracking/stage — tick/untick one stage on one line
// item. ADMIN + OPS only (SALES has no tracking; VIEWER is read-only). One
// transaction inside lib/order-entry/workflow.ts: stamps actual + delay and
// recomputes the line's operations status.
export async function PATCH(req: Request) {
  const guard = await requireCapability("operations.edit");
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = stageToggleSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodError(parsed.error), 422);

  const { line_item_id, stage_key, checked, stock_status, planned, actual } =
    parsed.data;

  // Guard against a stage_key on a line that doesn't exist → clean 404.
  const [line] = await db
    .select({
      id: orderLineItems.id,
      isCancelled: orderLineItems.isCancelled,
      isDeleted: orderLineItems.isDeleted,
    })
    .from(orderLineItems)
    .where(eq(orderLineItems.id, line_item_id))
    .limit(1);
  if (!line) return jsonError("Line item not found", 404);
  if (line.isDeleted) return jsonError("This design has been deleted.", 409);
  if (line.isCancelled) return jsonError("This design is cancelled.", 409);

  try {
    const lineStatus = await applyStageProgress({
      orderLineItemId: line_item_id,
      stageKey: stage_key,
      isDone: checked,
      stockStatus: stock_status ?? null,
      plannedAt:
        planned === undefined ? undefined : planned ? new Date(planned) : null,
      actualAt: actual ? new Date(actual) : null,
      updatedBy: guard.user.email ?? guard.user.name ?? null,
    });

    return jsonData({
      line_item_id,
      stage_key,
      checked,
      stock_status: stock_status ?? null,
      line_status: lineStatus,
    });
  } catch (e) {
    // Sequencing-rule violations are user-facing (409); anything else is a 500.
    if (e instanceof WorkflowError) return jsonError(e.message, 409);
    console.error("PATCH /api/order-entry/tracking/stage failed:", e);
    return jsonError("Failed to update stage", 500);
  }
}
