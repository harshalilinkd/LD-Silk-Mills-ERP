"use client";

// Month-by-month history — ported from Order Entry's
// components/dashboard/monthly-report.tsx, restyled onto this repo's table
// conventions (see order-status/page.tsx).
//
// Answers "when did we start, and what has each month looked like since?".
// Clicking a row points the whole dashboard at that month by writing
// ?from=…&to= — the same URL contract the filter bar uses.
import { useMemo } from "react";

import { formatCount, formatNumber } from "@/lib/order-entry/orders";
import { monthLabel, monthOfRange, monthRange } from "@/lib/order-entry/months";
import type { Department } from "@/lib/order-entry/dashboard";
import { useMonthlyReport } from "./use-monthly-report";
import { useRangeNav } from "./use-range-nav";
import { cn } from "@/lib/utils";

// "2026-05-17" → "17 May 2026". The shared formatDate omits the year, which is
// exactly what a "since when" line needs to keep.
function fullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

const TH_CLS =
  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3";
const TD_CLS = "border-b border-border px-3.5 py-2.5";

const COLUMNS: { label: string; right?: boolean }[] = [
  { label: "Month" },
  { label: "Orders", right: true },
  { label: "Designs", right: true },
  { label: "Qty (m)", right: true },
  { label: "Value", right: true },
  { label: "Completed", right: true },
  { label: "In progress", right: true },
  { label: "Pending", right: true },
  { label: "Cancelled", right: true },
];

export function MonthlyReportTable({
  from,
  to,
  department,
}: {
  from: string;
  to: string;
  department: Department;
}) {
  const { report, loading } = useMonthlyReport(department);
  const { apply } = useRangeNav({ from, to });
  const selectedMonth = monthOfRange(from, to);

  const months = useMemo(() => report?.months ?? [], [report]);
  const since = report?.since;

  const totals = useMemo(
    () =>
      months.reduce(
        (t, m) => ({
          orders: t.orders + m.orders,
          designs: t.designs + m.designs,
          qtyMtr: t.qtyMtr + m.qtyMtr,
          value: t.value + m.value,
        }),
        { orders: 0, designs: 0, qtyMtr: 0, value: 0 },
      ),
    [months],
  );

  return (
    <div className="rounded-[10px] border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3.5 pt-[18px]">
        <div>
          <h2 className="text-[14.5px] font-bold text-text-1">Monthly report</h2>
          <p className="mt-1 text-[12px] text-text-3">
            {since?.firstOrderDate ? (
              <>
                Oldest order dated{" "}
                <span className="font-medium text-text-2">
                  {fullDate(since.firstOrderDate)}
                </span>
                {since.firstEnteredAt ? (
                  <>
                    {" · system in use since "}
                    <span className="font-medium text-text-2">
                      {fullDate(since.firstEnteredAt.slice(0, 10))}
                    </span>
                  </>
                ) : null}
                {" · "}
                <span className="font-mono">{formatCount(since.ordersTotal)}</span>{" "}
                orders in total
              </>
            ) : loading ? (
              "Loading…"
            ) : (
              "No orders yet."
            )}
          </p>
        </div>
        {selectedMonth ? (
          <button
            type="button"
            onClick={() => apply({ preset: "30d" })}
            className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
          >
            Clear month
          </button>
        ) : null}
      </div>

      {months.length === 0 ? (
        <p className="px-5 pb-6 text-center text-[12.5px] text-text-3">
          {loading ? "Loading…" : "Nothing to report yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[13px]">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className={cn(TH_CLS, c.right ? "text-right" : "text-left")}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const isSelected = selectedMonth === m.month;
                const empty = m.orders === 0;
                return (
                  <tr
                    key={m.month}
                    onClick={() => apply(monthRange(m.month))}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-surface-2",
                    )}
                  >
                    <td className={cn(TD_CLS, "font-medium")}>
                      <span className={empty ? "text-text-3" : "text-text-1"}>
                        {monthLabel(m.month)}
                      </span>
                      {isSelected ? (
                        <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          Showing
                        </span>
                      ) : null}
                      {empty ? (
                        <span className="ml-2 text-[11px] text-text-3">
                          no orders
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        TD_CLS,
                        "text-right font-mono font-semibold",
                        empty ? "text-text-3" : "text-text-1",
                      )}
                    >
                      {formatCount(m.orders)}
                    </td>
                    <td className={cn(TD_CLS, "text-right font-mono text-text-2")}>
                      {formatCount(m.designs)}
                      {m.cancelledDesigns ? (
                        <span
                          className="ml-1 font-sans text-[10.5px] text-status-red"
                          title={`${m.cancelledDesigns} cancelled`}
                        >
                          +{formatCount(m.cancelledDesigns)}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(TD_CLS, "text-right font-mono text-text-2")}>
                      {formatNumber(m.qtyMtr)}
                    </td>
                    <td className={cn(TD_CLS, "text-right font-mono text-text-1")}>
                      ₹{formatNumber(m.value)}
                    </td>
                    <td
                      className={cn(
                        TD_CLS,
                        "text-right font-mono",
                        m.completedOrders ? "text-status-green" : "text-text-3",
                      )}
                    >
                      {formatCount(m.completedOrders)}
                    </td>
                    <td
                      className={cn(
                        TD_CLS,
                        "text-right font-mono",
                        m.partiallyOrders ? "text-status-amber" : "text-text-3",
                      )}
                    >
                      {formatCount(m.partiallyOrders)}
                    </td>
                    <td className={cn(TD_CLS, "text-right font-mono text-text-3")}>
                      {formatCount(m.pendingOrders)}
                    </td>
                    <td
                      className={cn(
                        TD_CLS,
                        "text-right font-mono",
                        m.cancelledOrders ? "text-status-red" : "text-text-3",
                      )}
                    >
                      {formatCount(m.cancelledOrders)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong">
                <td className="px-3.5 py-2.5 text-[11.5px] font-medium text-text-3">
                  All months
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono font-bold text-text-1">
                  {formatCount(totals.orders)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono font-bold text-text-1">
                  {formatCount(totals.designs)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono font-bold text-text-1">
                  {formatNumber(totals.qtyMtr)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono font-bold text-text-1">
                  ₹{formatNumber(totals.value)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
