"use client";

// CRM → analytics (docs/SCREENS.md §7.6)
//
// Read-only, so unlike Follow-ups and Issues this screen takes NOTHING from the
// session: giving it a `canEdit` prop it cannot use would suggest otherwise.

import { CrmAnalyticsView } from "@/components/order-entry/crm/analytics-view";

export default function CrmAnalyticsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          CRM analytics
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          What the follow-up work adds up to. Coverage first — it qualifies every
          other number here.
        </p>
      </div>

      <CrmAnalyticsView />
    </div>
  );
}
