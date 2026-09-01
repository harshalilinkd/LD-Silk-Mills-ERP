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
};
