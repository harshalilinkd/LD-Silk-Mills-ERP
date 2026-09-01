"use client";

import type { Capability, Role } from "@/lib/order-entry/rbac";
import { ModuleTabs, type ModuleTab } from "./module-tabs";

const TABS: ModuleTab[] = [
  { label: "Dashboard", href: "/order-entry", exact: true },
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
  { label: "Settings", href: "/order-entry/settings", adminOnly: true },
];

export function OrderEntryTabs({ role, caps }: { role: Role; caps: Capability[] }) {
  return <ModuleTabs tabs={TABS} role={role} caps={caps} />;
}
