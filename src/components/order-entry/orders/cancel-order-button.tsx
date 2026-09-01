"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBan, IconRotateClockwise } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

export function CancelOrderButton({
  orderId,
  cancelled,
}: {
  orderId: string;
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
        body: JSON.stringify({ cancelled: !cancelled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to update order");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={isPending}
        onClick={toggle}
        className={cancelled ? "" : "text-status-red hover:text-status-red"}
      >
        {cancelled ? (
          <IconRotateClockwise className="size-4" />
        ) : (
          <IconBan className="size-4" />
        )}
        {cancelled ? "Restore order" : "Cancel order"}
      </Button>
      {error && <span className="text-[12px] text-status-red">{error}</span>}
    </div>
  );
}
