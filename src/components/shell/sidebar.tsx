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
import { SidebarUserCard } from "./sidebar-user-card";
import type { System } from "@/db/schema";

const CATEGORY_ORDER: { key: System["category"]; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "operations", label: "Operations" },
  { key: "finance", label: "Finance" },
  { key: "reports", label: "Reports" },
  { key: "admin", label: "Admin" },
];

export function Sidebar({
  visibleSystems,
  name,
  email,
  avatar,
}: {
  visibleSystems: System[];
  name: string;
  email: string;
  avatar: string | null;
}) {
  const byCategory = CATEGORY_ORDER.map(({ key, label }) => ({
    label,
    systems: visibleSystems.filter((s) => s.category === key),
  })).filter((group) => group.systems.length > 0);

  return (
    <aside className="hidden w-[264px] shrink-0 flex-col bg-sidebar border-r border-sidebar-border md:flex">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-[18px] py-[18px]">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-[#04211d]"
          style={{
            background: "linear-gradient(155deg, var(--primary), #0d9488)",
            fontFamily: "var(--font-mono)",
          }}
        >
          LD
        </div>
        <div className="overflow-hidden whitespace-nowrap">
          <div className="text-[14.5px] font-bold tracking-[-0.01em] text-sidebar-foreground">
            LD Silk Mills ERP
          </div>
          <div className="text-[11px] text-text-3">ERP Shell</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3.5">
        <div className="mb-0.5">
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

        <div className="mt-3.5 space-y-0.5">
          <NavLink href="/reports" icon={<IconReportAnalytics />}>
            Reports
          </NavLink>
          <NavLink href="/ai-assistant" icon={<IconSparkles />}>
            AI Assistant
          </NavLink>
        </div>

        <CollapsibleSection title="Administration">
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

      <SidebarUserCard name={name} email={email} avatar={avatar} />
    </aside>
  );
}
