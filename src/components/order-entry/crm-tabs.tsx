"use client";

import type { Capability, Role } from "@/lib/order-entry/rbac";
import { ModuleTabs, type ModuleTab } from "./module-tabs";

const TABS: ModuleTab[] = [
  { label: "Follow-ups", href: "/crm", cap: "crm.view", exact: true },
  { label: "Issues", href: "/crm/issues", cap: "crm.view" },
  { label: "Call log", href: "/crm/calls", cap: "crm.view" },
  { label: "Customers", href: "/crm/customers", cap: "crm.view" },
  { label: "CRM analytics", href: "/crm/analytics", cap: "crm.view" },
  { label: "Settings", href: "/order-entry/settings/crm", adminOnly: true },
];

export function CrmTabs({ role, caps }: { role: Role; caps: Capability[] }) {
  return <ModuleTabs tabs={TABS} role={role} caps={caps} />;
}
