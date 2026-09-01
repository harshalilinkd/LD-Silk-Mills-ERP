"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hasCap, type Capability, type Role } from "@/lib/order-entry/rbac";

const TABS: { label: string; href: string; cap?: Capability }[] = [
  { label: "Dashboard", href: "/order-entry" },
  { label: "Orders", href: "/order-entry/orders", cap: "orders.view" },
  {
    label: "Order status",
    href: "/order-entry/order-status",
    cap: "orders.view",
  },
];

export function OrderEntryTabs({
  role,
  caps,
}: {
  role: Role;
  caps: Capability[];
}) {
  const pathname = usePathname();
  const visible = TABS.filter(
    (t) => !t.cap || role === "ADMIN" || hasCap(caps, t.cap),
  );

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {visible.map((t) => {
        const active =
          t.href === "/order-entry"
            ? pathname === "/order-entry"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
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
