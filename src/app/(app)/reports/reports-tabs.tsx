"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChartBar, IconDownload, IconProgressCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * Reports has three views of the same numbers, so it gets the same pill strip
 * every other multi-view area in this ERP uses (`SettingsTabs`, Petty Cash's
 * `Tabs`, Help Slip's settings).
 *
 * The dashboards and the downloads are NOT alternatives to each other. A
 * dashboard answers "how are we doing" at a glance; a file answers "give me
 * every row so I can check it myself". Both are served from the same report
 * definitions, so the figure on the screen and the figure in the file cannot
 * drift apart.
 */
const TABS = [
  { href: "/reports", label: "Export files", icon: IconDownload },
  { href: "/reports/sales", label: "Sales dashboard", icon: IconChartBar },
  { href: "/reports/production", label: "Production dashboard", icon: IconProgressCheck },
];

export function ReportsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Reports sections"
      className="flex flex-wrap gap-1.5 rounded-field border border-border bg-surface-2 p-1.5"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-surface text-text-1 shadow-sm" : "text-text-3 hover:text-text-1",
            )}
          >
            <Icon className="size-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
