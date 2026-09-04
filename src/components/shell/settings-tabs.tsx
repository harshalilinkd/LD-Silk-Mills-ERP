"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconApps,
  IconHistory,
  IconShieldLock,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * The ERP's own settings strip — the same pill strip Order Entry and Help Slip
 * already use, so all three settings areas are one pattern.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 *
 * The four administration screens were real and working, and lived under
 * `/admin/*` in their own sidebar section, while `/settings` rendered
 * "coming soon". So the answer to "how do I add a user?" was a page that said
 * the feature did not exist yet, twelve pixels below a menu entry that did it.
 * Two places for one job is worse than one unfinished place.
 *
 * The admin tabs are hidden from non-admins, which is presentation only —
 * every action calls `requireErpAdmin()` itself and the layout refuses the
 * route.
 */
const TABS = [
  {
    key: "profile",
    label: "Your profile",
    href: "/settings",
    icon: IconUser,
    admin: false,
  },
  {
    key: "users",
    label: "Users",
    href: "/settings/users",
    icon: IconUsers,
    admin: true,
  },
  {
    key: "access",
    label: "Access",
    href: "/settings/access",
    icon: IconShieldLock,
    admin: true,
  },
  {
    // Moved out of Help Slip rules — deciding who joins is the same job as the
    // People tab, not a rule of a module. See the page for why only Help Slip
    // produces requests at all.
    key: "accessRequests",
    label: "Access requests",
    href: "/settings/access-requests",
    icon: IconUserPlus,
    admin: true,
  },
  {
    key: "systems",
    label: "Systems",
    href: "/settings/systems",
    icon: IconApps,
    admin: true,
  },
  {
    key: "audit",
    label: "Audit log",
    href: "/settings/audit",
    icon: IconHistory,
    admin: true,
  },
];

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const shown = TABS.filter((t) => !t.admin || isAdmin);

  return (
    <nav
      aria-label="Settings sections"
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
