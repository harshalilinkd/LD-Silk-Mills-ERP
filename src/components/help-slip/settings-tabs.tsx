"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBuildingFactory2,
  IconSettings,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * Help Slip's settings strip — Order Entry's `settings-tabs.tsx`, verbatim.
 *
 * Same pill strip on `bg-surface-2`, same lifted active tab, same 16px icons,
 * same real routes rather than `useState` (so a tab can be linked to and a
 * refresh does not send you back to the first one).
 *
 * WHICH TABS YOU SEE DEPENDS ON YOUR ROLE, and that is presentation only. Every
 * route re-checks, and the database checks again underneath that — a
 * coordinator who types /help-slip/settings/general gets a 403 from the API and
 * an empty screen, not a working form. Hiding a tab is a courtesy, never a
 * boundary.
 */
export type SettingsTabKey =
  "profile" | "users" | "departments" | "accessRequests" | "general";

const TABS: {
  key: SettingsTabKey;
  label: string;
  href: string;
  icon: typeof IconUser;
}[] = [
  {
    key: "profile",
    label: "Your details",
    href: "/help-slip/settings",
    icon: IconUser,
  },
  {
    key: "users",
    label: "Users & Access",
    href: "/help-slip/settings/users",
    icon: IconUsers,
  },
  {
    key: "departments",
    label: "Departments",
    href: "/help-slip/settings/departments",
    icon: IconBuildingFactory2,
  },
  {
    key: "accessRequests",
    label: "Access requests",
    href: "/help-slip/settings/access-requests",
    icon: IconUserPlus,
  },
  {
    key: "general",
    label: "General",
    href: "/help-slip/settings/general",
    icon: IconSettings,
  },
];

export function HelpSlipSettingsTabs({
  visible,
}: {
  /** From `settingsTabsFor(role)`. Absent keys are simply not rendered. */
  visible: Record<SettingsTabKey, boolean>;
}) {
  const pathname = usePathname();
  const shown = TABS.filter((t) => visible[t.key]);

  return (
    <nav
      aria-label="Help Slip settings sections"
      className="flex flex-wrap gap-1.5 rounded-field border border-border bg-surface-2 p-1.5"
    >
      {shown.map((t) => {
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
