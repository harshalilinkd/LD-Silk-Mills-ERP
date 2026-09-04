import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { CrmSettingsPanel } from "@/components/order-entry/settings/crm-settings";

/**
 * CRM's own settings, at last.
 *
 * These knobs — follow-up timings, rating criteria, complaint categories —
 * were only reachable as a TAB INSIDE ORDER ENTRY SETTINGS. CRM is a top-level
 * module with its own sidebar section, so to change a CRM rule you went to
 * Orders. It was the fourth settings area in the app and the one nobody would
 * find.
 *
 * Same component, same API, same ADMIN gate as before — only the address
 * changed. `/order-entry/settings/crm` now redirects here so any bookmark
 * still lands.
 */
export default async function CrmSettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // The same rule the Order Entry settings layout applied when this lived
  // there: ADMIN only, no partial view.
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
      <CrmSettingsPanel />
    </div>
  );
}
