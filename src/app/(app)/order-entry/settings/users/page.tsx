import { IconUsers } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function OrderEntryUsersSettingsPage() {
  return (
    <ComingSoon
      icon={IconUsers}
      title="Users — coming soon"
      description="Manage Order Entry's own user accounts and roles (ld_order_entry.users) — separate from the ERP shell's Administration → Users, which only controls sidebar visibility."
    />
  );
}
