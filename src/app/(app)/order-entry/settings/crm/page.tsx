import { CrmSettingsPanel } from "@/components/order-entry/settings/crm-settings";

// ADMIN-gating lives in ../layout.tsx. The knobs here are read live by
// loadCrmConfig() on every follow-up read path, so a change lands without a
// deploy — which is the whole reason this tab exists (SCREENS.md §6.4).
export default function CrmSettingsPage() {
  return <CrmSettingsPanel />;
}
