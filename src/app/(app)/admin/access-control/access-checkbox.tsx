"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
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
    <Switch
      checked={checked}
      disabled={isPending}
      onCheckedChange={(next) => {
        setChecked(next);
        startTransition(async () => {
          await setSystemAccess(userId, systemId, next);
        });
      }}
    />
  );
}
