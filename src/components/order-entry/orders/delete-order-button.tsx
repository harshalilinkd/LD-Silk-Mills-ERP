"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Whole-order soft delete (moves the order to Trash). Destructive and less
 * reversible than cancel, so it sits behind a confirm dialog.
 */
export function DeleteOrderButton({
  orderId,
  orderNo,
}: {
  orderId: string;
  orderNo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/order-entry/orders/${orderId}/delete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to delete order");
        return;
      }
      setOpen(false);
      router.push("/order-entry/orders");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-status-red hover:text-status-red"
      >
        <IconTrash className="size-4" />
        Delete
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete order {orderNo}?</DialogTitle>
          <DialogDescription>
            This moves the order and all of its designs to Trash. Nothing is
            erased, but the order will no longer show up in the orders list.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-[12px] text-status-red">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Keep order
          </Button>
          <Button
            variant="destructive"
            onClick={confirmDelete}
            disabled={isPending}
          >
            <IconTrash className="size-4" />
            {isPending ? "Deleting…" : "Delete order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
