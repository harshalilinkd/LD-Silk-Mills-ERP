"use client";

// CRM → one follow-up, deep-linked (docs/SCREENS.md §7.2)
//
// The panel's real home is over the queue (§7.2.1) — it is a floating window so
// the queue stays visible and reachable while a call is worked. This route
// stays as the DEEP LINK: a URL somebody bookmarked, pasted into a message, or
// arrived at from outside the queue still opens the same panel, and closing it
// lands them on the queue where the work is.
//
// The one thing the deep link cannot supply is the order value: it is derived
// from the lines' generated `line_total` and only the queue query computes it,
// so the panel prints `—` rather than inventing a zero (§8.16). Everything else
// — qualities, designs, metres, cancellations, days since delivery — is derived
// from the detail payload.

import { useRouter } from "next/navigation";
import * as React from "react";

import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import { FollowupPanel } from "@/components/order-entry/crm/followup-panel";

export default function FollowupDeepLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "crm.edit");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Follow-up
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Opened directly. Close the panel to go back to the queue.
        </p>
      </div>

      <FollowupPanel
        followupId={id}
        canEdit={canEdit}
        onClose={() => router.push("/crm")}
      />
    </div>
  );
}
