import {
  IconDatabase,
  IconLayoutDashboard,
  IconReportAnalytics,
  IconSparkles,
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
    <aside className="flex w-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* NO `hidden md:flex` here any more. Whether this is on screen is
          decided by <MobileNavPanel>, which is the only thing that knows
          about the drawer. Width comes from the wrapper too, so the drawer
          can be wider than the desktop rail without a second value here. */}
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
          {/* Masters sits OUTSIDE the module groups on purpose. Party, fabric,
              agent, transport, haste, sales person, departments, complaint
              categories and delay reasons are shared by every module and
              belong to none of them — they were buried under Order Entry
              Settings, so adding a transporter meant knowing to look inside
              Orders. */}
          <NavLink href="/masters" icon={<IconDatabase />}>
            Masters
          </NavLink>
          <NavLink href="/reports" icon={<IconReportAnalytics />}>
            Reports
          </NavLink>
          <NavLink href="/ai-assistant" icon={<IconSparkles />}>
            AI Assistant
          </NavLink>
        </div>

        {/* ONE entry, not five. Users / Access / Systems / Audit were their
            own sidebar section under /admin while /settings said "coming
            soon" — so the answer to "how do I add somebody?" was a page
            saying the feature did not exist, directly below a menu that did
            it. They are tabs inside Settings now, and the admin-only ones
            hide themselves for a member. */}
        <div className="flex flex-col gap-0.5">
          <NavLink href="/settings" icon={<IconSettings />}>
            Settings
          </NavLink>
        </div>
      </div>

      <SidebarUserCard name={name} email={email} avatar={avatar} />
    </aside>
  );
}
