// Ported verbatim from Order Entry's lib/workflow.ts — operations-stage logic
// (seeding, status derivation, tick/untick transaction) lives only here, same
// as the source.
//
// The stage vocabulary and every PURE function live in `workflow-constants.ts`
// and are re-exported below unchanged, so nothing that already imports from
// this file needs to change. Only `applyStageProgress` — the one function
// that touches the database — stays here. Importing ANYTHING from a module
// pulls in that module's own imports too; `STAGE_LABELS` living in the same
// file as `orderEntryDb` was what dragged `postgres` (and Node's `net`) into
// a CLIENT bundle that only wanted a label string. See the constants file's
// header for the full story.
import { eq } from "drizzle-orm";
import { orderEntryDb as dbx } from "@/db/order-entry";
import { lineStageProgress } from "@/db/order-entry/schema";
import {
  STAGE_INDEX,
  STAGE_LABELS,
  isAsideStage,
  computeLineStatus,
  computeDelayMinutes,
  type StageKey,
  type StockStatus,
  type OperationsStatus,
  WorkflowError,
} from "./workflow-constants";

export * from "./workflow-constants";

export async function applyStageProgress(params: {
  orderLineItemId: string;
  stageKey: StageKey;
  isDone: boolean;
  stockStatus?: StockStatus | null;
  plannedAt?: Date | null;
  actualAt?: Date | null;
  updatedBy?: string | null;
}): Promise<OperationsStatus> {
  const {
    orderLineItemId,
    stageKey,
    isDone,
    stockStatus,
    plannedAt,
    actualAt,
    updatedBy,
  } = params;
  const now = new Date();
  const idx = STAGE_INDEX[stageKey];
  const isStock = stageKey === "stock_checking";

  const becomingDone = isStock ? stockStatus === "in_stock" : isDone;
  const nextStock: StockStatus | null = isStock
    ? becomingDone
      ? "in_stock"
      : (stockStatus ?? null)
    : null;

  return dbx.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(lineStageProgress)
      .where(eq(lineStageProgress.orderLineItemId, orderLineItemId));

    const target = rows.find((r) => r.stageKey === stageKey);
    if (!target) {
      throw new Error("Stage row not found for this line item.");
    }
    const byKey = new Map(rows.map((r) => [r.stageKey, r]));

    if (isStock && !byKey.get("order_entry")?.isDone) {
      throw new WorkflowError(`Complete "${STAGE_LABELS.order_entry}" first.`);
    }
    // ── A HOLD IS NOT GATED BY THE SEQUENCE ────────────────────────────
    //
    // `on_hold` is an aside (see `ASIDE_STAGE_KEYS`), and goods can be held at
    // any point — including before anybody has checked stock. Its position in
    // `STAGE_KEYS` puts it past `stock_checking` in `STAGE_INDEX`, so without
    // this it would inherit the sequence's gate and refuse the one case the
    // column exists to record.
    if (becomingDone && !isAsideStage(stageKey) && idx > STAGE_INDEX.stock_checking) {
      if (!byKey.get("stock_checking")?.isDone) {
        throw new WorkflowError(
          `Set "${STAGE_LABELS.stock_checking}" to In stock first.`,
        );
      }
    }

    const planned = plannedAt !== undefined ? plannedAt : target.plannedAt;
    const actual = becomingDone ? (actualAt ?? now) : null;

    await tx
      .update(lineStageProgress)
      .set({
        plannedAt: planned,
        actualAt: actual,
        isDone: becomingDone,
        delayMinutes: becomingDone
          ? computeDelayMinutes(planned, actual as Date)
          : null,
        stockStatus: isStock ? nextStock : target.stockStatus,
        updatedBy: updatedBy ?? null,
        updatedAt: now,
      })
      .where(eq(lineStageProgress.id, target.id));

    const updated = await tx
      .select({
        stageKey: lineStageProgress.stageKey,
        isDone: lineStageProgress.isDone,
      })
      .from(lineStageProgress)
      .where(eq(lineStageProgress.orderLineItemId, orderLineItemId));

    return computeLineStatus(updated);
  });
}
