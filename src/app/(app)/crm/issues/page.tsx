"use client";

// CRM → Issues (docs/SCREENS.md §7.3)
//
// The one CRM screen that needs a <Suspense> boundary: the board reads
// `useSearchParams` for the call-log deep link (`?q=<order no>&status=ALL`),
// and Next requires any component doing that to be suspended.

import { Suspense, useState } from "react";
import { IconCalendar } from "@tabler/icons-react";

import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import { IssuesBoard } from "@/components/order-entry/crm/issues-board";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function CrmIssuesPage() {
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "crm.edit");

  // Lifted out of the board so the trigger can live up here, top-right of the
  // page — the raised-date window is secondary to status/category/severity
  // and doesn't need a permanent row of its own.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const hasDateFilter = !!(from || to);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Issues
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
            Complaints raised on a follow-up call. Worst first — severity, then
            age.
          </p>
        </div>

        <Popover>
          <PopoverTrigger
            className={cn(
              "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1",
              hasDateFilter && "border-primary/50 text-primary",
            )}
            title="Filter by date raised"
            aria-label="Filter by date raised"
          >
            <IconCalendar className="size-4" />
            {hasDateFilter ? (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto">
            <div className="flex flex-col gap-2 p-0.5">
              <span className="text-[11px] font-medium text-text-2">
                Raised between
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Raised from"
                  className="h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span className="text-text-2">–</span>
                <input
                  type="date"
                  aria-label="Raised to"
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

      <Suspense
        fallback={
          <div className="rounded-card border border-border bg-surface px-4 py-10 text-center text-[13px] text-text-2">
            Loading…
          </div>
        }
      >
        <IssuesBoard canEdit={canEdit} from={from} to={to} />
      </Suspense>
    </div>
  );
}
