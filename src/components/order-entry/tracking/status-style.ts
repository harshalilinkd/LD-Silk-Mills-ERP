// Tone/label maps for the OperationsStatus rollup, styled against this
// shell's tokens (docs/DESIGN.md) — bg-status-{color}-dim + text-status-{color},
// the same idiom as components/order-entry/order-status/status-style.ts.
import type { OperationsStatus } from "@/lib/order-entry/orders";

export const OPERATIONS_TONE: Record<OperationsStatus, string> = {
  COMPLETED: "bg-status-green-dim text-status-green",
  "PARTIALLY COMPLETED": "bg-status-amber-dim text-status-amber",
  PENDING: "bg-chip text-text-3",
  CANCELLED: "bg-status-red-dim text-status-red",
};

export const OPERATIONS_LABEL: Record<OperationsStatus, string> = {
  COMPLETED: "Completed",
  "PARTIALLY COMPLETED": "Partially completed",
  PENDING: "Pending",
  CANCELLED: "Cancelled",
};

// Text-only variant, for inline prose inside the confirm dialogs.
export const OPERATIONS_TEXT_TONE: Record<OperationsStatus, string> = {
  COMPLETED: "text-status-green",
  "PARTIALLY COMPLETED": "text-status-amber",
  PENDING: "text-text-2",
  CANCELLED: "text-status-red",
};
