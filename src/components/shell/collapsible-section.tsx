"use client";

import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="px-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
      >
        <span>{title}</span>
        <IconChevronDown
          className={cn(
            "size-3.5 transition-transform duration-150",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {open && <div className="mt-0.5 flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}
