"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconClockHour4, IconStar } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * CRM rules' tab strip — Order Entry's `settings-tabs.tsx`, verbatim.
 *
 * Same pill strip on `bg-surface-2`, same lifted active tab, same 16px icons,
 * same real routes rather than `useState` (so a tab can be linked to and a
 * refresh does not send you back to the first one).
 *
 * CRM rules was the one settings area with NO strip: everything sat on a
 * single scrolling page while Order Entry rules and Help Slip rules both had
 * tabs. All four settings areas now look and behave the same way, which is the
 * whole point of the consolidation — the odd one out reads as unfinished.
 *
 * TWO TABS, because there are two genuinely different jobs here against two
 * different tables: `crm_settings` decides when a follow-up appears and when
 * it escalates; `crm_rating_criteria` decides what a delivered order is scored
 * on. They were stacked on one page, so the second was below the fold.
 */
const TABS = [
  {
    label: "CRM follow-ups",
    href: "/crm/settings",
    icon: IconClockHour4,
  },
  {
    label: "Rating criteria",
    href: "/crm/settings/rating-criteria",
    icon: IconStar,
  },
];

export function CrmSettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="CRM settings sections"
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
              active
                ? "bg-surface text-text-1 shadow-sm"
                : "text-text-3 hover:text-text-1",
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
