"use client";

// Per-design writes — docs/SCREENS.md §3.6, §3.10
//
// One design (an `order_line_items` row) has exactly two reversible states a
// user can put it in, and both hit the SAME endpoints the whole-order actions
// use — with a `line_id` so only this one line flips:
//
//   cancel  → PATCH /api/order-entry/orders/:id/cancel  { line_id, cancelled }
//   delete  → PATCH /api/order-entry/orders/:id/delete  { line_id, deleted:true }
//
// **Delete is a SOFT delete.** It moves the design to Trash — hidden from
// lists and operations, stage progress preserved, restorable from the Trash
// screen. Nothing here erases a row.
//
// ── Why the hook and the buttons live in one module ───────────────────────
// Two callers need these writes and they sit in different worlds: the ORDER
// DETAIL page is a Server Component (so it needs `router.refresh()` to see the
// change) while the Orders table's designs panel (§3.6) is driven by TanStack
// Query (so it needs the cache invalidated). `useDesignActions` does the
// invalidation for both; `refreshRoute` adds the server round trip only where
// it is actually needed. Keeping one implementation is the point — the two
// used to drift.

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBan, IconRotateClockwise, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

async function patchOrder(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "Failed to update this design.");
  }
}

/**
 * The two per-design mutations plus the invalidation fan-out every design
 * touches. Named by §3.6.
 *
 * A design is visible on four screens at once (Orders, Order status, the
 * tracker, the order's own tracking board) and lands in Trash on a fifth, so
 * every one of those keys is invalidated — a cancelled design that still reads
 * as live on the board next door is the bug this prevents.
 */
export function useDesignActions(orderId: string) {
  const qc = useQueryClient();

  const invalidate = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["order", orderId] });
    void qc.invalidateQueries({ queryKey: ["order-status"] });
    void qc.invalidateQueries({ queryKey: ["order-tracker"] });
    void qc.invalidateQueries({ queryKey: ["tracking", orderId] });
    void qc.invalidateQueries({ queryKey: ["trash"] });
  }, [qc, orderId]);

  const cancelDesign = useMutation({
    mutationFn: (v: { lineId: string; cancelled: boolean }) =>
      patchOrder(`/api/order-entry/orders/${orderId}/cancel`, {
        line_id: v.lineId,
        cancelled: v.cancelled,
      }),
    onSuccess: invalidate,
  });

  const deleteDesign = useMutation({
    mutationFn: (lineId: string) =>
      patchOrder(`/api/order-entry/orders/${orderId}/delete`, {
        line_id: lineId,
        deleted: true,
      }),
    onSuccess: invalidate,
  });

  return { cancelDesign, deleteDesign };
}

export type DesignLineActionsProps = {
  orderId: string;
  lineId: string;
  cancelled: boolean;
  /** The trash button. Off on the order detail page, which has no Trash link. */
  canDelete?: boolean;
  /**
   * Also `router.refresh()` after a write. Server-rendered callers need it;
   * query-driven ones already re-read from the invalidated cache.
   */
  refreshRoute?: boolean;
  className?: string;
};

/**
 * Cancel / restore (+ optionally delete) one design. Both buttons share one
 * `useDesignActions` instance so a write disables the pair — clicking Delete
 * while a Cancel is still in flight raced them.
 */
export function DesignLineActions({
  orderId,
  lineId,
  cancelled,
  canDelete = true,
  refreshRoute = false,
  className,
}: DesignLineActionsProps) {
  const router = useRouter();
  const { cancelDesign, deleteDesign } = useDesignActions(orderId);
  const busy = cancelDesign.isPending || deleteDesign.isPending;
  const error =
    (cancelDesign.error as Error | null)?.message ??
    (deleteDesign.error as Error | null)?.message ??
    null;

  const done = React.useCallback(() => {
    if (refreshRoute) router.refresh();
  }, [refreshRoute, router]);

  const cancelLabel = cancelled ? "Restore design" : "Cancel design";

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      {error && <span className="text-[11px] text-status-red">{error}</span>}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={cancelLabel}
          title={
            cancelled ? "Restore design" : "Cancel design (strike through)"
          }
          // Amber, not red: cancelling a design is reversible and is NOT the
          // destructive action in this row — the trash button is.
          className={
            cancelled
              ? ""
              : "text-status-amber hover:bg-status-amber-dim hover:text-status-amber"
          }
          onClick={() =>
            cancelDesign.mutate(
              { lineId, cancelled: !cancelled },
              { onSuccess: done },
            )
          }
        >
          {cancelDesign.isPending ? (
            <Spinner className="size-3.5" />
          ) : cancelled ? (
            <IconRotateClockwise className="size-3.5" />
          ) : (
            <IconBan className="size-3.5" />
          )}
        </Button>

        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label="Delete design"
            title="Delete design (move to Trash)"
            className="text-status-red hover:bg-status-red-dim hover:text-status-red"
            onClick={() => deleteDesign.mutate(lineId, { onSuccess: done })}
          >
            {deleteDesign.isPending ? (
              <Spinner className="size-3.5" />
            ) : (
              <IconTrash className="size-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Per-design cancel / restore on the ORDER DETAIL page (a Server Component),
 * which is why it refreshes the route. Kept as its own export because that page
 * offers no delete — designs are removed from the Orders table or from Trash.
 */
export function CancelLineButton({
  orderId,
  lineId,
  cancelled,
}: {
  orderId: string;
  lineId: string;
  cancelled: boolean;
}) {
  return (
    <DesignLineActions
      orderId={orderId}
      lineId={lineId}
      cancelled={cancelled}
      canDelete={false}
      refreshRoute
    />
  );
}
