// The `status` query param behind the orders list's KPI cards, shared by the
// Server Component page (which filters its own rows) and the CSV export button
// (which filters the rows it downloads from the API). Kept in one place so the
// on-screen list and the exported file can never disagree about what
// "In progress" means.
//
// GET /api/order-entry/orders has no `status` param on purpose: the rollup is
// derived from stage progress, not stored, so it can't be a SQL predicate
// without duplicating workflow.ts in the query. Both callers therefore filter
// the derived value client-side / in-process, using this one predicate.
import type { OperationsStatus } from "@/lib/order-entry/orders";

export const ORDER_STATUS_PARAMS = [
  "completed",
  "in_progress",
  "pending",
  "cancelled",
] as const;

export type OrderStatusParam = (typeof ORDER_STATUS_PARAMS)[number];

export function isOrderStatusParam(
  value: string | undefined,
): value is OrderStatusParam {
  return (
    value !== undefined &&
    (ORDER_STATUS_PARAMS as readonly string[]).includes(value)
  );
}

const STATUS_BY_PARAM: Record<
  Exclude<OrderStatusParam, "cancelled">,
  OperationsStatus
> = {
  completed: "COMPLETED",
  in_progress: "PARTIALLY COMPLETED",
  pending: "PENDING",
};

/**
 * "Cancelled" means *has at least one cancelled design*, not "the whole order
 * is cancelled" — the same rule the old dashboard's Cancelled KPI used, and
 * why its value counts designs rather than orders.
 */
export function matchesOrderStatusParam(
  row: { status: OperationsStatus; cancelledCount: number },
  param: OrderStatusParam,
): boolean {
  if (param === "cancelled") return row.cancelledCount > 0;
  return row.status === STATUS_BY_PARAM[param];
}
