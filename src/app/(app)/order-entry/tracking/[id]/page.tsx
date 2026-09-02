import { TrackingBoard } from "@/components/order-entry/tracking/tracking-board";

// The board itself is a client component: it loads
// GET /api/order-entry/orders/:id/tracking and mutates through
// PATCH /api/order-entry/tracking/stage, both of which already enforce
// operations.view / operations.edit server-side. Capability gating for the
// controls comes from useOrderEntrySession() inside the board.
export default async function TrackingOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TrackingBoard orderId={id} />;
}
