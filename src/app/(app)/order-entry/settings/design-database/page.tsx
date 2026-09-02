import { DesignDatabasePanel } from "@/components/order-entry/settings/design-database-panel";

// ADMIN-gating lives in ../layout.tsx.
export default function DesignDatabaseSettingsPage() {
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h2 className="text-[14.5px] font-bold text-text-1">Design database</h2>
        <p className="mt-0.5 text-[11.5px] text-text-3">
          Every (order, fabric, design) the order form has logged — the source
          for design autocomplete. Delete junk rows here; the orders themselves
          are untouched.
        </p>
      </div>
      <DesignDatabasePanel />
    </div>
  );
}
