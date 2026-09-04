import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CrmSettingsTabs } from "@/components/order-entry/settings/crm-settings-tabs";
import { Reveal } from "@/components/ui/reveal";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";

/**
 * CRM rules.
 *
 * The heading, the ADMIN gate and the tab strip live here rather than on each
 * page, so both tabs are guarded by one check and neither can be shipped
 * without it — the same shape as Order Entry's settings layout.
 *
 * ADMIN only, and no partial view: this is the rule that applied when these
 * knobs were a tab inside Order Entry settings, and it did not change when
 * they moved out.
 */
export default async function CrmSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const authz = await resolveOrderEntryAuthz(session.user.email);
  if (!authz || authz.role !== "ADMIN") redirect("/crm");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          CRM rules
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          When follow-ups are created, when they are due, and what a call is
          scored on. Complaint categories and departments live in Masters.
        </p>
      </div>
      {/* §6: the strip is Reveal index 0, the panel index 1 — the tabs land
          first and the panel follows, so the page reads as arriving in order
          rather than all at once. */}
      <Reveal index={0}>
        <CrmSettingsTabs />
      </Reveal>
      <Reveal index={1}>{children}</Reveal>
    </div>
  );
}
