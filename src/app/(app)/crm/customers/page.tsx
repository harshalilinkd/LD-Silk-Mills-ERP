"use client";

// CRM → Customers (docs/SCREENS.md §7.5)
//
// Read-only, so it takes NOTHING from the session. There is deliberately no
// create/edit/delete anywhere on this screen: it is a VIEW over orders,
// follow-ups and complaints, never a second customer master.

import { CustomersView } from "@/components/order-entry/crm/customers-view";

export default function CrmCustomersPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Customers
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Orders and value from the order book, ratings and complaints from the
          CRM — grouped by CRR customer where we have one.
        </p>
      </div>

      <CustomersView />
    </div>
  );
}
