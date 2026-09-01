"use client";

import { IconBell } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationBell() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="size-9 rounded-lg text-text-2 hover:bg-surface-2 hover:text-text-1"
          />
        }
      >
        <IconBell className="size-[18px]" />
        <span className="sr-only">Notifications</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 rounded-[10px] border-border-strong bg-surface-2 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
      >
        <div className="px-2 py-4 text-center text-[12.5px] text-text-3">
          No notifications yet
        </div>
      </PopoverContent>
    </Popover>
  );
}
