"use client";

// CRM → Issues (docs/SCREENS.md §7.3)
//
// The one CRM screen that needs a <Suspense> boundary: the board reads
// `useSearchParams` for the call-log deep link (`?q=<order no>&status=ALL`),
// and Next requires any component doing that to be suspended.

import { Suspense } from "react";

import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import { IssuesBoard } from "@/components/order-entry/crm/issues-board";

export default function CrmIssuesPage() {
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "crm.edit");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Issues
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Complaints raised on a follow-up call. Worst first — severity, then
          age.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-card border border-border bg-surface px-4 py-10 text-center text-[13px] text-text-2">
            Loading…
          </div>
        }
      >
        <IssuesBoard canEdit={canEdit} />
      </Suspense>
    </div>
  );
}
