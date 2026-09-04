"use client";

// CRM → Customers (docs/SCREENS.md §7.5)
//
// Read-only, so it takes NOTHING from the session. There is deliberately no
// create/edit/delete anywhere on this screen: it is a VIEW over orders,
// follow-ups and complaints, never a second customer master.

import { useState } from "react";
import { IconCalendar } from "@tabler/icons-react";

import { CustomersView } from "@/components/order-entry/crm/customers-view";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function CrmCustomersPage() {
  // Lifted up so the trigger sits top-right, beside the title — the
  // order-date window is a rarer refinement than rating/sort, so it doesn't
  // need a permanent row of its own.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const hasDateFilter = !!(from || to);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Customers
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
            Orders and value from the order book, ratings and complaints from
            the CRM — grouped by CRR customer where we have one.
          </p>
        </div>

        <Popover>
          <PopoverTrigger
            className={cn(
              "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1",
              hasDateFilter && "border-primary/50 text-primary",
            )}
            title="Filter by order date"
            aria-label="Filter by order date"
          >
            <IconCalendar className="size-4" />
            {hasDateFilter ? (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto">
            <div className="flex flex-col gap-2 p-0.5">
              <span className="text-[11px] font-medium text-text-2">
                Orders between
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Orders from"
                  className="h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span className="text-text-2">–</span>
                <input
                  type="date"
                  aria-label="Orders to"
                  className="h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              {hasDateFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="cursor-pointer self-end text-[12px] font-medium text-text-2 hover:text-text-1"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <CustomersView from={from} to={to} />
    </div>
  );
}
