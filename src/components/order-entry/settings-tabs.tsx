"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Dropdown Master", href: "/order-entry/settings/dropdown-master" },
  { label: "Design Database", href: "/order-entry/settings/design-database" },
  { label: "Time tracking", href: "/order-entry/settings/time-tracking" },
  { label: "Users", href: "/order-entry/settings/users" },
  { label: "Access", href: "/order-entry/settings/access" },
  { label: "Trash", href: "/order-entry/settings/trash" },
  { label: "CRM", href: "/order-entry/settings/crm" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href;
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
