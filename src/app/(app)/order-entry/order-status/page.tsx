// Order status — docs/SCREENS.md §4
//
// A thin server shell: it reads the session for the user's email (the key for
// the per-user remembered view and column prefs) and hands both halves of the
// screen to the client.
//
// **No data is loaded here.** The board (§4A) and the tracker (§4B) both
// fetch through TanStack Query against /api/order-entry/order-status, which
// does the grouping, the KPI counts, the refinement and the pagination
// server-side (§4A.2). Loading the same list again in this page would be a
// second round trip for a header line.
//
// The <Suspense> boundary is required: OrderStatusScreen reads
// useSearchParams() for the Dashboard's deep links (?overall=, ?stage=,
// ?cancelled=1). Without it the build fails.
import { Suspense } from "react";

import { auth } from "@/auth";
import { OrderStatusScreen } from "@/components/order-entry/order-status/order-status-screen";
import { OrderStatusBoard } from "@/components/order-entry/order-status/order-status-board";

export default async function OrderStatusPage() {
  // The layout above has already redirected anyone without a session, so this
  // is a read for the storage key alone — never an access decision.
  const session = await auth();
  const userKey = session?.user?.email ?? undefined;

  const title = (
    <div>
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Order status
      </h1>
      <p className="mt-1 text-[13px] text-text-3">
        Where every order sits across the seven stages. Read-only — updates
        happen in Operations.
      </p>
    </div>
  );

  return (
    <Suspense fallback={null}>
      <OrderStatusScreen
        userKey={userKey}
        title={title}
        // The board carries its own Export button in its toolbar (§4A.4), so
        // there is nothing left for the screen's action slot.
        actions={null}
        board={<OrderStatusBoard userKey={userKey} />}
      />
    </Suspense>
  );
}
