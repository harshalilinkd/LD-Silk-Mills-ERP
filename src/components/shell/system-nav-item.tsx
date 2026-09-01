"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconExternalLink } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getSystemIcon } from "@/lib/system-icons";
import type { System } from "@/db/schema";

export function SystemNavItem({ system }: { system: System }) {
  const pathname = usePathname();
  const Icon = getSystemIcon(system.systemCode);
  const isComingSoon = system.status !== "active";

  if (isComingSoon) {
    return (
      <div
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/35"
        title="Coming soon"
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{system.systemName}</span>
        <span className="ml-auto rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sidebar-foreground/40">
          Soon
        </span>
      </div>
    );
  }

  const isExternal = system.openMode === "external";
  const href =
    isExternal && system.applicationUrl
      ? system.applicationUrl
      : (system.route ?? `/${system.systemCode}`);
  const active = !isExternal && pathname === href;

  const className = cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );

  const label = (
    <>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{system.systemName}</span>
      {isExternal && (
        <IconExternalLink className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/40" />
      )}
    </>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
