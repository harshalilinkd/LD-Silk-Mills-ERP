import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { SettingsTabs } from "@/components/order-entry/settings-tabs";

// Consolidated admin area for both Order Entry and CRM config — ADMIN only
// (same rule as Order Entry's own Settings: non-admins never see this, no
// partial view). Order Entry's "Users"/"Access" tabs here manage
// ld_order_entry.users / role_permissions — a different thing from the ERP
// shell's own /admin/users, which manages who can see the sidebar entry at
// all. Both happen to be called "Users"; worth remembering they're not the
// same list.
export default async function OrderEntrySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const authz = await resolveOrderEntryAuthz(session.user.email);
  if (!authz || authz.role !== "ADMIN") redirect("/order-entry");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Order Entry Settings
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Admin configuration for Order Entry and CRM.
        </p>
      </div>
      <SettingsTabs />
      {children}
    </div>
  );
}
