// Orders — docs/SCREENS.md §3
//
// A Server Component whose only job is capabilities: it reads the session,
// resolves `orders.edit` / `operations.view`, and hands them to the client
// screen. Capabilities come from the server session, never from a fetch.
//
// It no longer runs the list query itself. §3.2 moved the table onto TanStack
// Query with `all=1` because the KPI cards must count every matching order AND
// act as one-click filters — which the server could only do by re-rendering the
// whole page per click. The tracking view (the default, §3.1) was already
// client-fetched, so this page now renders nothing but the frame.
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { hasCap } from "@/lib/order-entry/rbac";
import { OrdersScreen } from "@/components/order-entry/orders/orders-screen";

export default async function OrdersListPage() {
  const session = await auth();
  const authz = session?.user?.email
    ? await resolveOrderEntryAuthz(session.user.email)
    : null;
  const isAdmin = authz?.role === "ADMIN";
  const canEdit = !!authz && (isAdmin || hasCap(authz.caps, "orders.edit"));
  const canTrack =
    !!authz && (isAdmin || hasCap(authz.caps, "operations.view"));

  const title = (
    <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
      Orders
    </h1>
  );

  return (
    <OrdersScreen canEdit={canEdit} canTrack={canTrack} title={title} />
  );
}
