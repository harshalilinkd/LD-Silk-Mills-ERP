// Ported verbatim from Order Entry's lib/workflow.ts — operations-stage logic
// (seeding, status derivation, tick/untick transaction) lives only here, same
// as the source.
import { eq } from "drizzle-orm";
import { orderEntryDb as dbx } from "@/db/order-entry";
import { lineStageProgress } from "@/db/order-entry/schema";

export const STAGE_KEYS = [
  "order_entry",
  "stock_checking",
  "rolling_checking",
  "challan",
  "bill",
  "dispatch",
  "received_lr",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export type StockStatus = "in_stock" | "out_of_stock";

export class WorkflowError extends Error {}

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGE_KEYS.map((k, i) => [k, i]),
);

export const STAGE_LABELS: Record<StageKey, string> = {
  order_entry: "Order entry",
  stock_checking: "Stock checking",
  rolling_checking: "Rolling & checking",
  challan: "Challan",
  bill: "Bill",
  dispatch: "Dispatch",
  received_lr: "Received LR",
};

export type OperationsStatus =
  | "COMPLETED"
  | "PARTIALLY COMPLETED"
  | "PENDING"
  | "CANCELLED";

export function plannedAtForOffset(orderDate: string, offsetDays: number): Date {
  const d = new Date(`${orderDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export function buildInitialStageRows(
  orderLineItemId: string,
  orderDate: string,
  offsets: Record<string, number>,
) {
  return STAGE_KEYS.map((stageKey) => ({
    orderLineItemId,
    stageKey,
    plannedAt: plannedAtForOffset(orderDate, offsets[stageKey] ?? 1),
    actualAt: null,
    isDone: false,
    delayMinutes: null,
  }));
}

export const PROGRESS_STAGE_KEYS_LIST = [
  "rolling_checking",
  "challan",
  "bill",
  "dispatch",
  "received_lr",
] as const;
const PROGRESS_STAGE_KEYS = new Set<string>(PROGRESS_STAGE_KEYS_LIST);

export function computeLineStatus(
  stages: { stageKey: string; isDone: boolean }[],
): OperationsStatus {
  if (stages.length === 0) return "PENDING";
  if (stages.every((s) => s.isDone)) return "COMPLETED";
  const started = stages.some(
    (s) => s.isDone && PROGRESS_STAGE_KEYS.has(s.stageKey),
  );
  return started ? "PARTIALLY COMPLETED" : "PENDING";
}

export function lineStatusFromCounts(counts: {
  stageRows: number;
  doneRows: number;
  anyProgressStageDone: boolean;
}): OperationsStatus {
  if (counts.stageRows === 0) return "PENDING";
  if (counts.doneRows === counts.stageRows) return "COMPLETED";
  return counts.anyProgressStageDone ? "PARTIALLY COMPLETED" : "PENDING";
}

export function computeOrderStatus(
  lineStatuses: OperationsStatus[],
): OperationsStatus {
  if (lineStatuses.length === 0) return "PENDING";
  if (lineStatuses.every((s) => s === "COMPLETED")) return "COMPLETED";
  if (lineStatuses.every((s) => s === "PENDING")) return "PENDING";
  return "PARTIALLY COMPLETED";
}

export function isOrderCancelled(total: number, cancelled: number): boolean {
  return total > 0 && cancelled === total;
}

export function isOrderDeleted(total: number, deleted: number): boolean {
  return total > 0 && deleted === total;
}

export function lineMatchKey(parts: {
  quality: string;
  designNo: string;
  qtyMtr: string | number;
}): string {
  return [
    parts.quality.trim().toLowerCase(),
    parts.designNo.trim().toLowerCase(),
    Number(parts.qtyMtr),
  ].join("|");
}

export function computeDelayMinutes(planned: Date | null, actual: Date): number {
  if (!planned) return 0;
  return Math.round((actual.getTime() - planned.getTime()) / 60000);
}

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
    if (becomingDone && idx > STAGE_INDEX.stock_checking) {
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
