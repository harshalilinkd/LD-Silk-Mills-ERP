// Ported from Order Entry's lib/rbac.ts — roles/capabilities/route access are
// unchanged; only the paths are re-prefixed with /order-entry to match this
// module's mount point inside the shell.

export type Role = "ADMIN" | "SALES" | "OPS" | "VIEWER" | "CRM";

export const ROLES: Role[] = ["ADMIN", "SALES", "OPS", "VIEWER", "CRM"];

export type Capability =
  | "orders.view"
  | "orders.edit"
  | "operations.view"
  | "operations.edit"
  | "crm.view"
  | "crm.edit";

export const CAPABILITIES: { key: Capability; label: string; hint: string }[] = [
  {
    key: "orders.view",
    label: "View orders",
    hint: "Dashboard, orders list & detail, order status",
  },
  {
    key: "orders.edit",
    label: "Create / edit orders",
    hint: "New order, edit, delete",
  },
  {
    key: "operations.view",
    label: "View operations",
    hint: "See the 7-stage tracking board",
  },
  {
    key: "operations.edit",
    label: "Update operations",
    hint: "Mark stages done, set stock status",
  },
  {
    key: "crm.view",
    label: "View CRM",
    hint: "Follow-up queue, issues, customer history",
  },
  {
    key: "crm.edit",
    label: "Work the CRM queue",
    hint: "Log calls, rate orders, raise and resolve issues",
  },
];

export const CAPABILITY_KEYS: Capability[] = CAPABILITIES.map((c) => c.key);

export const EDITABLE_ROLES: Role[] = ["SALES", "OPS", "VIEWER", "CRM"];

export const DEFAULT_ROLE_CAPS: Record<Role, Capability[]> = {
  ADMIN: [
    "orders.view",
    "orders.edit",
    "operations.view",
    "operations.edit",
    "crm.view",
    "crm.edit",
  ],
  SALES: ["orders.view", "orders.edit"],
  OPS: ["orders.view", "operations.view", "operations.edit"],
  VIEWER: ["orders.view", "operations.view"],
  CRM: ["orders.view", "crm.view", "crm.edit"],
};

export function hasCap(
  caps: readonly string[] | undefined | null,
  cap: Capability,
): boolean {
  return !!caps && caps.includes(cap);
}

export type NavItem = {
  label: string;
  href: string;
  cap?: Capability;
  adminOnly?: boolean;
  children?: NavItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/order-entry" },
  { label: "New order", href: "/order-entry/orders/new", cap: "orders.edit" },
  { label: "Orders", href: "/order-entry/orders", cap: "orders.view" },
  {
    label: "Order status",
    href: "/order-entry/order-status",
    cap: "orders.view",
  },
  {
    label: "Operations",
    href: "/order-entry/tracking",
    cap: "operations.view",
  },
  {
    label: "CRM",
    href: "/order-entry/crm",
    cap: "crm.view",
    children: [
      { label: "Follow-ups", href: "/order-entry/crm", cap: "crm.view" },
      { label: "Issues", href: "/order-entry/crm/issues", cap: "crm.view" },
      { label: "Call log", href: "/order-entry/crm/calls", cap: "crm.view" },
      {
        label: "Customers",
        href: "/order-entry/crm/customers",
        cap: "crm.view",
      },
      {
        label: "CRM analytics",
        href: "/order-entry/crm/analytics",
        cap: "crm.view",
      },
    ],
  },
  { label: "Settings", href: "/order-entry/settings", adminOnly: true },
];

export function visibleNav(role: Role, caps: readonly string[]): NavItem[] {
  const allowed = (item: NavItem): boolean => {
    if (item.adminOnly) return role === "ADMIN";
    if (item.cap) return role === "ADMIN" || hasCap(caps, item.cap);
    return true;
  };
  return NAV_ITEMS.filter(allowed).flatMap((item) => {
    if (!item.children) return [item];
    const children = item.children.filter(allowed);
    return children.length ? [{ ...item, children }] : [];
  });
}

// Paths are relative to the /order-entry mount point (i.e. what's left after
// stripping the "/order-entry" prefix — "" or "/" for the dashboard itself).
export function canAccessPath(
  role: Role,
  caps: readonly string[],
  subPath: string,
): boolean {
  if (role === "ADMIN") return true;

  if (subPath === "/settings" || subPath.startsWith("/settings/")) {
    return false;
  }
  if (subPath === "" || subPath === "/") return true;

  if (subPath === "/trash" || subPath.startsWith("/trash/")) {
    return hasCap(caps, "orders.edit");
  }
  if (subPath === "/orders/new" || /^\/orders\/[^/]+\/edit$/.test(subPath)) {
    return hasCap(caps, "orders.edit");
  }
  if (
    subPath === "/orders" ||
    subPath.startsWith("/orders/") ||
    subPath === "/order-status" ||
    subPath.startsWith("/order-status/")
  ) {
    return hasCap(caps, "orders.view");
  }
  if (subPath === "/tracking" || subPath.startsWith("/tracking/")) {
    return hasCap(caps, "operations.view");
  }
  if (subPath === "/crm" || subPath.startsWith("/crm/")) {
    return hasCap(caps, "crm.view");
  }

  return true;
}
