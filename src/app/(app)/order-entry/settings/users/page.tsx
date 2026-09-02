import { UsersManage } from "@/components/order-entry/settings/users-manage";

// ADMIN-gating lives in ../layout.tsx. Note this manages ld_order_entry.users
// — the Order Entry account list — not the ERP shell's own /admin/users.
export default function UsersSettingsPage() {
  return <UsersManage />;
}
