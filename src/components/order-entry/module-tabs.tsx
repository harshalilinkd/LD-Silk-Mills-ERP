"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hasCap, type Capability, type Role } from "@/lib/order-entry/rbac";

export type ModuleTab = {
  label: string;
  href: string;
  cap?: Capability;
  adminOnly?: boolean;
  /** Exact match required (e.g. a module's own root/dashboard tab). */
  exact?: boolean;
};

export function ModuleTabs({
  tabs,
  role,
  caps,
}: {
  tabs: ModuleTab[];
  role: Role;
  caps: Capability[];
}) {
  const pathname = usePathname();
  const visible = tabs.filter((t) => {
    if (t.adminOnly) return role === "ADMIN";
    if (t.cap) return role === "ADMIN" || hasCap(caps, t.cap);
    return true;
  });

  // Only the single longest-matching href lights up — otherwise a nested
  // route (e.g. /orders/new) would light up both its own tab and a broader
  // parent tab (e.g. "Orders") at the same time.
  const matches = (t: ModuleTab) =>
    t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
  const activeHref = visible
    .filter(matches)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {visible.map((t) => {
        const active = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-primary text-text-1"
                : "border-transparent text-text-3 hover:text-text-2",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
