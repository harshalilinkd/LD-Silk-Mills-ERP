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
      <div className="flex cursor-default items-center gap-[11px] rounded-lg border border-transparent px-2.5 py-2 text-[13.5px] font-medium text-text-3">
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{system.systemName}</span>
        <span className="shrink-0 rounded-full bg-status-amber-dim px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.03em] text-status-amber">
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
    "flex items-center gap-[11px] rounded-lg border px-2.5 py-2 text-[13.5px] font-medium transition-colors",
    active
      ? "border-primary/20 bg-accent text-accent-text"
      : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text-1",
  );

  const label = (
    <>
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{system.systemName}</span>
      {isExternal && (
        <IconExternalLink className="size-3 shrink-0 text-text-3" />
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
