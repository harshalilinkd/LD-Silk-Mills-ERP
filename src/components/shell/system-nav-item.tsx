"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconExternalLink, IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getSystemIcon } from "@/lib/system-icons";
import { SYSTEM_SUBMENUS } from "@/lib/system-submenus";
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

  const submenu = !isExternal ? SYSTEM_SUBMENUS[system.systemCode] : undefined;

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

  if (submenu) {
    return (
      <ExpandableSystemNavItem
        system={system}
        href={href}
        icon={Icon}
        submenu={submenu}
        pathname={pathname}
      />
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

function ExpandableSystemNavItem({
  system,
  href,
  icon: Icon,
  submenu,
  pathname,
}: {
  system: System;
  href: string;
  icon: ReturnType<typeof getSystemIcon>;
  submenu: { label: string; href: string; exact?: boolean }[];
  pathname: string;
}) {
  const inSection = pathname === href || pathname.startsWith(`${href}/`);
  const [open, setOpen] = useState(inSection);

  // Only the single longest-matching child href is active, so a nested route
  // (e.g. /order-entry/orders/new) doesn't light up both "Orders" and
  // "New order" at once.
  const matches = (item: { href: string; exact?: boolean }) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const activeHref = submenu
    .filter(matches)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-[11px] rounded-lg border px-2.5 py-2 text-[13.5px] font-medium transition-colors",
          inSection
            ? "border-primary/20 bg-accent text-accent-text"
            : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text-1",
        )}
      >
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-[11px]">
          <Icon className="size-4 shrink-0" />
          <span className="flex-1 truncate">{system.systemName}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          className="shrink-0 rounded p-0.5 text-current hover:bg-white/10"
        >
          <IconChevronDown
            className={cn(
              "size-3.5 transition-transform duration-150",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      </div>
      {open && (
        <div className="mt-0.5 ml-3.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {submenu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                item.href === activeHref
                  ? "text-accent-text"
                  : "text-text-3 hover:text-text-1",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
