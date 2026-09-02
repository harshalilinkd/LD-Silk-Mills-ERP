"use client";

// Date-range filter bar, ported from the filter row at the top of Order
// Entry's components/dashboard/dashboard-view.tsx and repainted with this
// repo's filter-bar conventions (see order-status/page.tsx).
//
// Everything here writes to the query string and nothing else — the page above
// is a Server Component that re-runs loadDashboard() on every navigation. The
// exact contract lives in ./use-range-nav.
//
// The highlighted pill is decided by comparing the *resolved* range the server
// queried against presetRange(), so `?preset=7d` and a hand-typed equivalent
// `?from=…&to=…` light up the same pill.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconRefresh } from "@tabler/icons-react";

import {
  presetRange,
  type DateRangePreset,
  type Department,
} from "@/lib/order-entry/dashboard";
import { monthLabel, monthOfRange, monthRange } from "@/lib/order-entry/months";
import { clearMonthlyReportCache, useMonthlyReport } from "./use-monthly-report";
import { useRangeNav, type RangePreset } from "./use-range-nav";
import { cn } from "@/lib/utils";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
];

const FIELD_CLS =
  "h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:border-border-strong";

export function DashboardFilterBar({
  from,
  to,
  today,
  department,
}: {
  /** The range the server actually queried, not the raw query string. */
  from: string;
  to: string;
  /** Resolved server-side so the client never disagrees about "today". */
  today: string;
  department: Department;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { apply, pending } = useRangeNav({ from, to });

  const { report } = useMonthlyReport(department);
  const selectedMonth = monthOfRange(from, to);

  const activePreset: DateRangePreset =
    PRESETS.find((p) => {
      const r = presetRange(p.key, today);
      return r.from === from && r.to === to;
    })?.key ?? "custom";

  const busy = pending || refreshing;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface p-2.5">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const active = activePreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ preset: p.key })}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface-2 text-text-2 hover:text-text-1",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <select
        aria-label="Month"
        value={selectedMonth ?? ""}
        onChange={(e) => {
          const key = e.target.value;
          apply(key ? monthRange(key) : { preset: "30d" });
        }}
        className={FIELD_CLS}
      >
        <option value="">By month…</option>
        {(report?.months ?? []).map((m) => (
          <option key={m.month} value={m.month}>
            {monthLabel(m.month)}
            {m.orders ? ` (${m.orders})` : " — none"}
          </option>
        ))}
      </select>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <input
          type="date"
          aria-label="From date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && apply({ from: e.target.value })}
          className={cn(
            FIELD_CLS,
            "min-w-0 flex-1 num sm:w-[148px] sm:flex-none",
          )}
        />
        <span className="text-text-3">–</span>
        <input
          type="date"
          aria-label="To date"
          value={to}
          min={from}
          onChange={(e) => e.target.value && apply({ to: e.target.value })}
          className={cn(
            FIELD_CLS,
            "min-w-0 flex-1 num sm:w-[148px] sm:flex-none",
          )}
        />
      </div>

      <button
        type="button"
        aria-label="Refresh"
        title="Refresh"
        disabled={busy}
        onClick={() => {
          // router.refresh() re-runs loadDashboard() on the server; the monthly
          // report is a separate client-cached fetch, so drop it too.
          clearMonthlyReportCache();
          startRefresh(() => router.refresh());
        }}
        className="ml-auto flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-2 transition-colors hover:text-text-1 disabled:opacity-50"
      >
        <IconRefresh className={cn("size-4", busy && "animate-spin")} />
      </button>
    </div>
  );
}
