import { IconShieldLock } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function OrderEntryAccessSettingsPage() {
  return (
    <ComingSoon
      icon={IconShieldLock}
      title="Access — coming soon"
      description="Edit the role × capability grant matrix (orders.view, orders.edit, operations.*, crm.*) that governs Order Entry and CRM."
    />
  );
}
