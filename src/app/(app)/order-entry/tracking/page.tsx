// Operations index — docs/SCREENS.md §5.1
//
// A thin server shell over the client screen. No capability check here: the
// whole route is already gated by `operations.view` (the Order Entry layout
// resolves the session, and GET /api/order-entry/orders re-checks
// orders.view OR operations.view on every request the client makes).
//
// It used to be a server component with a GET form, which meant every
// keystroke was a navigation and the phone layout was a 900px scroller. §5.1
// wants a live, debounced, client-side list — so the work moved into
// <TrackingIndex />.
import { TrackingIndex } from "@/components/order-entry/tracking/tracking-index";

export default function OperationsTrackingPage() {
  return <TrackingIndex />;
}
