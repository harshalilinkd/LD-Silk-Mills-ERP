import { TrashView } from "@/components/order-entry/settings/trash-view";

// ADMIN-gating lives in ../layout.tsx. (The trash APIs themselves are
// orders.edit rather than ADMIN, so this same view could be surfaced outside
// Settings later without any change to the component.)
export default function TrashSettingsPage() {
  return <TrashView />;
}
