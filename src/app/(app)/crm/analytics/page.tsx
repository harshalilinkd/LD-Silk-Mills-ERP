"use client";

// CRM → analytics (docs/SCREENS.md §7.6)
//
// Read-only, so unlike Follow-ups and Issues this screen takes NOTHING from the
// session: giving it a `canEdit` prop it cannot use would suggest otherwise.

import { useState } from "react";
import { IconCalendar } from "@tabler/icons-react";

import { CrmAnalyticsView } from "@/components/order-entry/crm/analytics-view";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function CrmAnalyticsPage() {
  // Lifted up so the trigger sits top-right, beside the title, rather than
  // spending a whole row on two date inputs the way the old range bar did.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const hasDateFilter = !!(from || to);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            CRM analytics
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
            What the follow-up work adds up to. Coverage first — it qualifies
            every other number here.
          </p>
        </div>

        <Popover>
          <PopoverTrigger
            className={cn(
              "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1",
              hasDateFilter && "border-primary/50 text-primary",
            )}
            title="Filter by delivery date"
            aria-label="Filter by delivery date"
          >
            <IconCalendar className="size-4" />
            {hasDateFilter ? (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto">
            <div className="flex flex-col gap-2 p-0.5">
              <span className="text-[11px] font-medium text-text-2">
                Delivered between
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="From"
                  className="h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span className="text-text-2">–</span>
                <input
                  type="date"
                  aria-label="To"
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

      <CrmAnalyticsView from={from} to={to} />
    </div>
  );
}
