"use client";

// OrdersScreen — docs/SCREENS.md §3.1
//
// The switch that puts the Tracking view (§4B) and the orders table behind one
// control. The same tracking view the Order status screen offers, on Orders
// too — the operator looking up "where is 1135?" should not have to know which
// of the two screens carries that answer.
//
// TRACKING IS THE DEFAULT here. When it sat behind the switch as the
// non-default nobody found it, which was the entire problem it was built to
// solve. The table is one click away and the choice is remembered.
//
// The storage key is "…:v2" DELIBERATELY: the earlier default here was the
// table, and a stored "table" under the old key would have kept hiding the
// tracking view from exactly the users who had already visited.
//
// ── Both halves are client components ─────────────────────────────────────
// The table half (§3.2) fetches the entire matching set through TanStack Query
// rather than being server-rendered, because the KPI cards must count every
// matching order AND act as filters — impossible if the client only holds one
// page. So this file imports both views directly and only decides which one is
// on screen. The server page's job shrank to reading capabilities.

import * as React from "react";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { OrderTracker } from "@/components/order-entry/order-status/order-tracker";
import { OrdersDashboard } from "@/components/order-entry/orders/orders-dashboard";
import { ViewSwitch } from "@/components/order-entry/shared/view-switch";
import { useTrackView } from "@/components/order-entry/shared/use-track-view";

export function OrdersScreen({
  canEdit,
  canTrack,
  /** `<h1>Orders</h1>` + its subtitle. Shown in both views. */
  title,
}: {
  /**
   * Already resolved by the page from the session (ADMIN, or the `orders.edit`
   * capability). Passed as a boolean so the rule for who may create an order
   * lives in exactly one place.
   */
  canEdit: boolean;
  /** `operations.view` — gates the per-row Track action on the table. */
  canTrack: boolean;
  title: React.ReactNode;
}) {
  const { view, setView } = useTrackView("oe:orders:view:v2", "track");

  const track = view === "track";

  // "New order" TRAVELS WITH THE SWITCH: in the tracking view it goes into the
  // tracker's own toolbar slot; in the table view it lives in the table's own
  // toolbar (§3.4), beside Filters / Refresh / Export.
  const control = (
    <>
      <ViewSwitch value={view} onChange={setView} secondLabel="Orders" />
      {canEdit && track ? (
        <Button
          className="shrink-0"
          nativeButton={false}
          render={<Link href="/order-entry/orders/new" />}
        >
          <IconPlus className="size-3.5" /> New order
        </Button>
      ) : null}
    </>
  );

  if (track) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {title}
        </div>
        <OrderTracker toolbar={control} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {title}
        <div className="flex items-center gap-2">{control}</div>
      </div>
      <OrdersDashboard canEdit={canEdit} canTrack={canTrack} />
    </div>
  );
}
