// Sidebar sub-navigation for systems that have real pages built. Not
// DB-driven (systems.route is a single string) — this is shell-level UI
// config, hand-maintained as each module grows real pages worth linking to
// directly from the sidebar. A system with no entry here renders as a plain
// link, same as before.
export type SystemSubmenuItem = {
  label: string;
  href: string;
  exact?: boolean;
};

export const SYSTEM_SUBMENUS: Record<string, SystemSubmenuItem[]> = {
  "order-entry": [
    { label: "Dashboard", href: "/order-entry", exact: true },
    { label: "New order", href: "/order-entry/orders/new" },
    { label: "All Orders", href: "/order-entry/orders" },
    { label: "Order status", href: "/order-entry/order-status" },
    { label: "Operations", href: "/order-entry/tracking" },
    { label: "Order Entry rules", href: "/order-entry/settings" },
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
    // Admin-only in practice, the same as CRM rules: the four other tabs
    // moved to ERP Settings and Masters, so what is left is the General panel
    // and only an admin may change it. The entry stays unconditional because
    // this map is static — a non-admin who clicks it is sent to the Help Slip
    // dashboard by the page itself, which is what CRM rules already does.
    { label: "Help Slip rules", href: "/help-slip/settings" },
  ],
  // Goods Return LR. Every entry is visible to BOTH offices — the office
  // decides what a screen offers, not whether the screen exists, and a menu
  // that changes shape under you is harder to learn than one that does not.
  // "New return" is the exception the page itself handles: Bhiwandi reaching it
  // gets turned back, the same way CRM rules turns back a non-admin.
  "goods-return-lr": [
    { label: "Dashboard", href: "/goods-return", exact: true },
    { label: "New return", href: "/goods-return/returns/new" },
    { label: "All returns", href: "/goods-return/returns" },
    { label: "Receiving", href: "/goods-return/receiving" },
    { label: "Reports", href: "/goods-return/reports" },
  ],
  crm: [
    { label: "Follow-ups", href: "/crm", exact: true },
    { label: "Issues", href: "/crm/issues" },
    { label: "Call log", href: "/crm/calls" },
    { label: "Customers", href: "/crm/customers" },
    { label: "CRM analytics", href: "/crm/analytics" },
    { label: "CRM rules", href: "/crm/settings" },
  ],
};
