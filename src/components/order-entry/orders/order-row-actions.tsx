"use client";

// The per-row action cluster on the orders list (view / edit / track / cancel /
// delete), ported from Order Entry's orders-dashboard Actions column. The list
// page itself stays a Server Component, so anything that mutates or needs a
// confirm step lives here.
//
// Cancel and delete both PATCH the existing routes and then router.refresh()
// the server-rendered list — same shape as cancel-order-button.tsx on the order
// detail page. Restoring a cancelled order is immediate (it's undoable);
// cancelling and deleting go through a confirm dialog, matching the old app.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconBan,
  IconEdit,
  IconEye,
  IconRotateClockwise,
  IconRoute,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";

type Confirm = "cancel" | "delete";

export function OrderRowActions({
  orderId,
  orderNo,
  cancelled,
}: {
  orderId: string;
  orderNo: string;
  cancelled: boolean;
}) {
  const router = useRouter();
  const { role, caps } = useOrderEntrySession();
  const isAdmin = role === "ADMIN";
  const canEdit = isAdmin || hasCap(caps, "orders.edit");
  const canTrack = isAdmin || hasCap(caps, "operations.view");

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mutate(
    action: "cancel" | "delete",
    body: Record<string, unknown>,
    onDone?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/order-entry/orders/${orderId}/${action}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(
          payload?.error ??
            (action === "cancel"
              ? "Failed to update order"
              : "Failed to delete order"),
        );
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          aria-label={`View ${orderNo}`}
          title="View"
          render={<Link href={`/order-entry/orders/${orderId}`} />}
        >
          <IconEye className="size-4" />
        </Button>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label={`Edit ${orderNo}`}
            title="Edit"
            render={<Link href={`/order-entry/orders/${orderId}/edit`} />}
          >
            <IconEdit className="size-4" />
          </Button>
        )}
        {canTrack && (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label={`Track ${orderNo}`}
            title="Track"
            render={<Link href={`/order-entry/tracking/${orderId}`} />}
          >
            <IconRoute className="size-4" />
          </Button>
        )}
        {canEdit &&
          (cancelled ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Restore ${orderNo}`}
              title="Restore order"
              disabled={isPending}
              onClick={() => mutate("cancel", { cancelled: false })}
            >
              <IconRotateClockwise className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Cancel ${orderNo}`}
              title="Cancel order"
              className="text-status-red hover:text-status-red"
              onClick={() => setConfirm("cancel")}
            >
              <IconBan className="size-4" />
            </Button>
          ))}
        {canEdit && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${orderNo}`}
            title="Delete order"
            className="text-status-red hover:text-status-red"
            onClick={() => setConfirm("delete")}
          >
            <IconTrash className="size-4" />
          </Button>
        )}
      </div>

      {/* An inline error only ever appears after a failed restore — the cancel
          and delete paths surface theirs inside the dialog. */}
      {error && !confirm && (
        <p className="mt-1 text-right text-[11.5px] text-status-red">{error}</p>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) {
            setConfirm(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirm === "delete"
                ? `Delete order ${orderNo}?`
                : `Cancel order ${orderNo}?`}
            </DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "This moves the order and all of its designs to Trash. Nothing is erased, and you can restore them from Trash at any time."
                : "The order and all of its designs stay on record but are excluded from totals and operations. You can restore it later."}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-[12px] text-status-red">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setConfirm(null);
                setError(null);
              }}
            >
              Keep order
            </Button>
            <Button
              disabled={isPending}
              className="bg-status-red-dim text-status-red hover:bg-status-red-dim/70"
              onClick={() =>
                confirm === "delete"
                  ? mutate("delete", { deleted: true }, () => setConfirm(null))
                  : mutate("cancel", { cancelled: true }, () => setConfirm(null))
              }
            >
              {confirm === "delete" ? (
                <IconTrash className="size-4" />
              ) : (
                <IconBan className="size-4" />
              )}
              {confirm === "delete"
                ? isPending
                  ? "Deleting…"
                  : "Delete order"
                : isPending
                  ? "Cancelling…"
                  : "Cancel order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
