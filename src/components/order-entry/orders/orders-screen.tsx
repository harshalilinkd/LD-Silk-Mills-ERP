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
// ── Why the table arrives as a prop ───────────────────────────────────────
// The orders table on this route is server-rendered (the page runs the Drizzle
// query itself, no client fetch). A Client Component cannot import a Server
// Component, but it can RECEIVE one as a prop, so the page hands its already-
// rendered markup down as `table` and this file only decides which half of the
// switch is shown. Nothing about the table is rewritten here.

import * as React from "react";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { OrderTracker } from "@/components/order-entry/order-status/order-tracker";
import { ViewSwitch } from "@/components/order-entry/shared/view-switch";
import { useTrackView } from "@/components/order-entry/shared/use-track-view";

export function OrdersScreen({
  canEdit,
  /** `<h1>Orders</h1>` + its subtitle. Shown in both views. */
  title,
  /** Export CSV + New order — the table view's own action row. */
  actions,
  /** The server-rendered KPI cards, filter form, table and pager. */
  table,
}: {
  /**
   * Already resolved by the page from the session (ADMIN, or the `orders.edit`
   * capability). Passed as a boolean so the rule for who may create an order
   * lives in exactly one place.
   */
  canEdit: boolean;
  title: React.ReactNode;
  actions: React.ReactNode;
  table: React.ReactNode;
}) {
  const { view, setView } = useTrackView("oe:orders:view:v2", "track");

  const track = view === "track";

  // "New order" TRAVELS WITH THE SWITCH: in the tracking view it goes into the
  // tracker's own toolbar slot rather than being left behind on the table,
  // because in that view the table's action row is not on screen at all.
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {title}
        <div className="flex items-center gap-2">
          {control}
          {actions}
        </div>
      </div>
      {table}
    </div>
  );
}
