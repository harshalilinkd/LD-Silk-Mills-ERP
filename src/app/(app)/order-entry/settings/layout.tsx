import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { SettingsTabs } from "@/components/order-entry/settings-tabs";
import { Reveal } from "@/components/ui/reveal";

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
      {/* §6: the strip is Reveal index 0, the panel index 1 — the tabs land
          first and the panel follows, so the page reads as arriving in order
          rather than all at once. */}
      <Reveal index={0}>
        <SettingsTabs />
      </Reveal>
      <Reveal index={1}>{children}</Reveal>
    </div>
  );
}
