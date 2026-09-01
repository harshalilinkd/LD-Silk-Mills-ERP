"use client";

import { IconBell, IconBellOff } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationBell() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
        <IconBell className="size-[18px]" />
        <span className="sr-only">Notifications</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <IconBellOff className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground">
            You&apos;ll see system and access updates here once they start
            coming in.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
