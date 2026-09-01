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
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-3 select-none"
      >
        <span>{title}</span>
        <IconChevronDown
          className={cn(
            "size-3 shrink-0 text-text-3 transition-transform duration-150",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {open && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}
