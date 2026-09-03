// Sidebar sub-navigation for systems that have real pages built. Not
// DB-driven (systems.route is a single string) — this is shell-level UI
// config, hand-maintained as each module grows real pages worth linking to
// directly from the sidebar. A system with no entry here renders as a plain
// link, same as before.
export type SystemSubmenuItem = { label: string; href: string; exact?: boolean };

export const SYSTEM_SUBMENUS: Record<string, SystemSubmenuItem[]> = {
  "order-entry": [
    { label: "Dashboard", href: "/order-entry", exact: true },
    { label: "New order", href: "/order-entry/orders/new" },
    { label: "Orders", href: "/order-entry/orders" },
    { label: "Order status", href: "/order-entry/order-status" },
    { label: "Operations", href: "/order-entry/tracking" },
    { label: "Settings", href: "/order-entry/settings" },
  ],
  // Help Slip's own nav differs by role — an employee has no queue and a
  // coordinator has no "my concerns" CTA. The sidebar is DB-driven and knows
  // nothing about Help Slip roles, so this lists the union and each screen
  // refuses what the viewer may not have: "All concerns" answers with the
  // coordinators-only screen for an employee rather than a filtered list they
  // would reasonably mistake for the whole archive.
  "help-slip": [
    { label: "Dashboard", href: "/help-slip", exact: true },
    { label: "Raise a concern", href: "/help-slip/concerns/new" },
    { label: "My concerns", href: "/help-slip/concerns" },
    { label: "All concerns", href: "/help-slip/all" },
    { label: "Notifications", href: "/help-slip/notifications" },
    // Everyone gets this — Profile is theirs. The other four tabs appear by
    // role inside the screen (see settingsTabsFor), which is why this entry is
    // unconditional while CRM's equivalent above points straight at an
    // admin-only route.
    { label: "Settings", href: "/help-slip/settings" },
  ],
  crm: [
    { label: "Follow-ups", href: "/crm", exact: true },
    { label: "Issues", href: "/crm/issues" },
    { label: "Call log", href: "/crm/calls" },
    { label: "Customers", href: "/crm/customers" },
    { label: "CRM analytics", href: "/crm/analytics" },
    { label: "Settings", href: "/order-entry/settings/crm" },
  ],
};
