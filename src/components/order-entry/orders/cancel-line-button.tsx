"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBan, IconRotateClockwise } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/**
 * Per-design (line item) cancel / restore. Hits the same endpoint as the
 * whole-order cancel, but with a `line_id` so only this one design flips.
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/order-entry/orders/${orderId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: lineId, cancelled: !cancelled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to update design");
        return;
      }
      router.refresh();
    });
  }

  const label = cancelled ? "Restore design" : "Cancel design";

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-[11px] text-status-red">{error}</span>}
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isPending}
        onClick={toggle}
        aria-label={label}
        title={label}
        className={cancelled ? "" : "text-status-red hover:text-status-red"}
      >
        {cancelled ? (
          <IconRotateClockwise className="size-3.5" />
        ) : (
          <IconBan className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
