"use client";

// OrderStatusScreen — docs/SCREENS.md §4.1
//
// Two ways to read the same data, side by side rather than one replacing the
// other: the Tracking view (§4B) answers "where is this order?", the Board
// (§4A) stays exactly as it was for the filtering and CSV work built on it.
//
// ── A deep link wins over the remembered choice ───────────────────────────
// `overall`, `stage` and `cancelled` only ever arrive from a Dashboard KPI
// card, and a card that says *Overdue* must land on the board with that filter
// applied — not on the tracker, which cannot express it. `setView` still
// writes the user's real preference, so the override lasts exactly one visit.
//
// The board arrives as a prop for the same reason as on Orders: it is
// server-rendered, and a Client Component can receive a Server Component but
// not import one.

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { OrderTracker } from "./order-tracker";
import { ViewSwitch } from "@/components/order-entry/shared/view-switch";
import { useTrackView } from "@/components/order-entry/shared/use-track-view";

export function OrderStatusScreen({
  /** The signed-in email, so the remembered view is per user. */
  userKey,
  /** `<h1>Order status</h1>` + its subtitle. Shown in both views. */
  title,
  /** Export CSV — the board's own action. */
  actions,
  /** The server-rendered KPI cards, filter form, grouped table and drawer. */
  board,
}: {
  userKey?: string;
  title: React.ReactNode;
  actions: React.ReactNode;
  board: React.ReactNode;
}) {
  const params = useSearchParams();
  const { view, setView } = useTrackView(
    `oe:order-status:view:${userKey ?? "anon"}`,
    "track",
  );

  // `||`, not `??`: an empty `?overall=` must fall through to the next param
  // rather than counting as "present but blank".
  const deepLinked =
    params.get("overall") || params.get("stage") || params.get("cancelled");
  const effective = deepLinked ? "table" : view;

  // The switch always shows what is ON SCREEN, so a deep-linked visit does not
  // sit on the board with "Tracking" lit.
  const control = (
    <ViewSwitch value={effective} onChange={setView} secondLabel="Board" />
  );

  if (effective === "track") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {title}
        </div>
        {/* `?search=` is forwarded straight into the tracker. */}
        <OrderTracker
          initialSearch={params.get("search") ?? ""}
          toolbar={control}
        />
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
      {board}
    </div>
  );
}
