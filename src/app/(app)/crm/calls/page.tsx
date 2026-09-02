"use client";

// CRM → Call log (docs/SCREENS.md §7.4)
//
// Read-only, so it takes NOTHING from the session — giving it a `canEdit` prop
// it cannot use would suggest otherwise.

import { CallsLog } from "@/components/order-entry/crm/calls-log";

export default function CrmCallsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Call log
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          What customers actually said — newest first. Search reaches inside the
          feedback text.
        </p>
      </div>

      <CallsLog />
    </div>
  );
}
