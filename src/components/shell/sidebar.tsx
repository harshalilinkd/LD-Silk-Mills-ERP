import Link from "next/link";
import {
  IconLayoutDashboard,
  IconReportAnalytics,
  IconSparkles,
  IconUsers,
  IconShieldLock,
  IconApps,
  IconHistory,
  IconSettings,
} from "@tabler/icons-react";
import { NavLink } from "./nav-link";
import { SystemNavItem } from "./system-nav-item";
import { CollapsibleSection } from "./collapsible-section";
import type { System } from "@/db/schema";

const CATEGORY_ORDER: { key: System["category"]; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "operations", label: "Operations" },
  { key: "finance", label: "Finance" },
  { key: "reports", label: "Reports" },
  { key: "admin", label: "Admin" },
];

export function Sidebar({ visibleSystems }: { visibleSystems: System[] }) {
  const byCategory = CATEGORY_ORDER.map(({ key, label }) => ({
    label,
    systems: visibleSystems.filter((s) => s.category === key),
  })).filter((group) => group.systems.length > 0);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          LD
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground">
          Silk Mills ERP
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-2 pb-1">
          <NavLink href="/" icon={<IconLayoutDashboard />}>
            Dashboard
          </NavLink>
        </div>

        {byCategory.map((group) => (
          <CollapsibleSection key={group.label} title={group.label}>
            {group.systems.map((system) => (
              <SystemNavItem key={system.id} system={system} />
            ))}
          </CollapsibleSection>
        ))}

        <div className="mt-1 space-y-0.5 px-2">
          <NavLink href="/reports" icon={<IconReportAnalytics />}>
            Reports
          </NavLink>
          <NavLink href="/ai-assistant" icon={<IconSparkles />}>
            AI Assistant
          </NavLink>
        </div>

        <CollapsibleSection title="Administration" defaultOpen={false}>
          <NavLink href="/admin/users" icon={<IconUsers />}>
            Users
          </NavLink>
          <NavLink href="/admin/access-control" icon={<IconShieldLock />}>
            Access Control
          </NavLink>
          <NavLink href="/admin/system-registry" icon={<IconApps />}>
            System Registry
          </NavLink>
          <NavLink href="/admin/audit-logs" icon={<IconHistory />}>
            Audit Logs
          </NavLink>
          <NavLink href="/settings" icon={<IconSettings />}>
            Settings
          </NavLink>
        </CollapsibleSection>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/settings"
          className="block text-center text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
        >
          v0.1.0 — Phase 1
        </Link>
      </div>
    </aside>
  );
}
