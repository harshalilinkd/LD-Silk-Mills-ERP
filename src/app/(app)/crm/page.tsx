"use client";

// CRM → Follow-ups (docs/SCREENS.md §7.1)
//
// The page is a shell: a title and the client queue. Everything on this screen
// is live (filters, live search, the KPI tiles, the panel), so there is nothing
// left for a server component to render — and `canEdit` comes from the session
// the CRM layout already resolved rather than a second database lookup.

import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import { FollowupQueue } from "@/components/order-entry/crm/followup-queue";

export default function CrmFollowupsPage() {
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "crm.edit");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Follow-ups
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Delivered orders waiting on a call, worst first.
        </p>
      </div>

      <FollowupQueue canEdit={canEdit} />
    </div>
  );
}
