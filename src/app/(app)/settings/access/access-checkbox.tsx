"use client";

import { useState, useTransition } from "react";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { setSystemAccess } from "./actions";

export function AccessCheckbox({
  userId,
  systemId,
  initialValue,
}: {
  userId: string;
  systemId: string;
  initialValue: boolean;
}) {
  const [checked, setChecked] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={isPending}
      onClick={() => {
        const next = !checked;
        setChecked(next);
        startTransition(async () => {
          await setSystemAccess(userId, systemId, next);
        });
      }}
      className={cn(
        "inline-flex size-[17px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors disabled:opacity-50",
        checked
          ? "border-primary bg-primary"
          : "border-border-strong bg-transparent",
      )}
    >
      {checked && (
        <IconCheck className="size-[11px] stroke-[3px] text-[#04211d]" />
      )}
    </button>
  );
}
