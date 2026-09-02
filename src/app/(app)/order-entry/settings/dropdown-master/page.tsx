import { DropdownMaster } from "@/components/order-entry/settings/dropdown-master";

// ADMIN-gating lives in ../layout.tsx (which also renders the h1 + tab bar),
// so this page is just the shell around the client island.
export default function DropdownMasterPage() {
  return <DropdownMaster />;
}
