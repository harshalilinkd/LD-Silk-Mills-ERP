"use client";

// Settings tab strip — docs/SCREENS.md §6.
//
// A pill strip, not an underline bar: `rounded-field border bg-surface-2
// p-1.5` with the active tab lifted onto `bg-surface` + `shadow-sm`, each tab
// carrying a `size-4` icon (list · database · timer · headset · users ·
// shield-check · trash).
//
// One deliberate difference from the source app: there the tab is
// `React.useState` inside a single settings-view component, so a tab could not
// be linked to and a refresh returned to Dropdown Master. Here each tab is a
// real route under /order-entry/settings/*, so the strip is `<Link>`s and the
// active tab comes from the pathname. Everything else — order, icons, sizes,
// active treatment — follows §6.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDatabase,
  IconShieldCheck,
  IconStopwatch,
  IconTrash,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// FOUR TABS LEFT, down from seven. §6 listed Dropdown Master · Design
// Database · Time tracking · CRM · Users · Access · Trash; four of those were
// never Order Entry's business and have moved to where they belong:
//
//   Dropdown Master -> /masters          (shared by every module)
//   Users           -> /settings/users   (one People screen for all systems)
//   CRM             -> /crm/settings     (CRM's own menu, at last)
//
// What is left is genuinely Order Entry's: its design log, its stage
// deadlines, who may do what within it, and its bin. "Access" is renamed
// "Role permissions" because it is a role x capability grid, NOT a list of
// people — the old name is exactly why it read as a duplicate user screen.
const TABS = [
  {
    label: "Design Database",
    href: "/order-entry/settings/design-database",
    icon: IconDatabase,
  },
  {
    label: "Time tracking",
    href: "/order-entry/settings/time-tracking",
    icon: IconStopwatch,
  },
  {
    label: "Role permissions",
    href: "/order-entry/settings/access",
    icon: IconShieldCheck,
  },
  { label: "Trash", href: "/order-entry/settings/trash", icon: IconTrash },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
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
