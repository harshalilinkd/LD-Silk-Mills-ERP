"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconScale,
  IconWallet,
} from "@tabler/icons-react";

import { addMonths, monthLabel, startOfMonth } from "@/lib/dates";
import { formatMoney, toNumber } from "@/lib/petty-cash/money";
import type { MonthSummary } from "@/lib/petty-cash/queries";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  PageHead,
  QuietButton,
  Select,
  TableCard,
  td,
  th,
} from "@/components/ui/module-parts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The monthly summary.
 *
 * ── THE PERCENTAGES ARE OF SPENDING, NOT OF EVERYTHING ───────────────────
 *
 * A category's share is its debits over the month's TOTAL DEBITS. Dividing by
 * credits + debits would make every share halve in a month that happened to
 * include a large deposit, which tells nobody anything about where the money
 * went.
 *
 * ── NOTHING IS COUNTED TWICE ─────────────────────────────────────────────
 *
 * The group figures come from one `GROUP BY` on the live category's group, and
 * the category figures from another on the snapshot name. Both are exhaustive
 * partitions of the same rows, so the groups add up to the total and so do the
 * categories — the old app's keyword matching could put one category in two
 * groups and did not add up.
 */
export function SummaryScreen({
  summary,
  years,
  today,
}: {
  summary: MonthSummary;
  years: number[];
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const anchor = summary.from;
  const [y, m] = anchor.split("-").map(Number);

  const go = (month: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("month", startOfMonth(month));
    router.push(`${pathname}?${next}`);
  };

  const totals = summary.totals;
  const debitTotal = toNumber(totals.debits) ?? 0;
  const net = toNumber(totals.balance) ?? 0;

  // The years that have data, plus the one being looked at, so a month reached
  // by a link never shows a picker that cannot represent it.
  const yearOptions = [...new Set([...years, y])].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Reporting"
        title="Monthly summary"
        lede="What one month took in, paid out, and what it was spent on."
      />

      {/* ── which month ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-field border border-border bg-surface p-2.5">
        <QuietButton
          aria-label="Previous month"
          className="h-9"
          onClick={() => go(addMonths(anchor, -1))}
        >
          <IconChevronLeft className="size-4" />
        </QuietButton>

        <Select
          aria-label="Month"
          className="w-auto min-w-[150px]"
          value={String(m)}
          onChange={(e) => go(`${y}-${String(Number(e.target.value)).padStart(2, "0")}-01`)}
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Year"
          className="w-auto min-w-[110px]"
          value={String(y)}
          onChange={(e) => go(`${e.target.value}-${String(m).padStart(2, "0")}-01`)}
        >
          {yearOptions.map((yr) => (
            <option key={yr} value={yr}>
              {yr}
            </option>
          ))}
        </Select>

        <QuietButton
          aria-label="Next month"
          className="h-9"
          onClick={() => go(addMonths(anchor, 1))}
        >
          <IconChevronRight className="size-4" />
        </QuietButton>

        <QuietButton className="h-9" onClick={() => go(startOfMonth(today))}>
          This month
        </QuietButton>

        <span className="ml-auto text-[12px] text-text-3">{monthLabel(anchor)}</span>
      </div>

      {/* ── the four figures ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure
          icon={<IconArrowDown className="size-4" />}
          label="Credit in"
          value={formatMoney(totals.credits)}
          tone="green"
        />
        <Figure
          icon={<IconArrowUp className="size-4" />}
          label="Debit out"
          value={formatMoney(totals.debits)}
          tone="red"
        />
        <Figure
          icon={<IconScale className="size-4" />}
          label="Net for the month"
          value={formatMoney(totals.balance)}
          tone={net < 0 ? "red" : "green"}
          sub={net < 0 ? "More went out than came in" : "More came in than went out"}
        />
        <Figure
          icon={<IconWallet className="size-4" />}
          label="Transactions"
          value={totals.count.toLocaleString("en-IN")}
          tone="grey"
        />
      </div>

      {totals.count === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconWallet className="size-5" />}
              title={`Nothing recorded in ${monthLabel(anchor)}`}
              body="Pick another month, or record the first entry for this one."
            />
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── by group ─────────────────────────────────────────────── */}
          <section className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                Where it went
              </div>
              <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                Spending by group
              </h2>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              {summary.byGroup.filter((g) => (toNumber(g.debits) ?? 0) > 0).length === 0 ? (
                <p className="text-[12.5px] text-text-3">Nothing was paid out this month.</p>
              ) : (
                summary.byGroup
                  .filter((g) => (toNumber(g.debits) ?? 0) > 0)
                  .map((g) => {
                    const v = toNumber(g.debits) ?? 0;
                    const pct = debitTotal > 0 ? Math.round((v / debitTotal) * 100) : 0;
                    return (
                      <div key={g.groupName}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13px] font-semibold text-text-1">
                            {g.groupName}
                          </span>
                          <span className="text-[12.5px] whitespace-nowrap">
                            <strong className="num font-bold text-text-1">
                              {formatMoney(g.debits)}
                            </strong>
                            <span className="num ml-2 text-text-3">{pct}%</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-3">
                          <div
                            className="h-full rounded-pill bg-status-red"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
            <p className="border-t border-border px-4 py-2 text-[11.5px] text-text-3">
              A share of the month&rsquo;s{" "}
              <strong className="num font-semibold text-text-2">
                {formatMoney(totals.debits)}
              </strong>{" "}
              paid out — deposits are not counted in these percentages.
            </p>
          </section>

          {/* ── by category ──────────────────────────────────────────── */}
          <section className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                In detail
              </div>
              <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                Spending by category
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={cn(th, "w-full")}>Category</th>
                    <th className={th}>Group</th>
                    <th className={cn(th, "text-right")}>Entries</th>
                    <th className={cn(th, "text-right")}>Paid out</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCategory.map((c) => (
                    <tr key={c.categoryName} className="transition-colors hover:bg-surface-2">
                      <td className={cn(td, "font-medium text-text-1")}>{c.categoryName}</td>
                      <td className={cn(td, "whitespace-nowrap text-text-3")}>{c.groupName}</td>
                      <td className={cn(td, "num text-right")}>{c.count}</td>
                      <td className={cn(td, "num text-right font-bold text-text-1")}>
                        {formatMoney(c.debits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-2 text-right">
              <Link
                href={`/petty-cash?from=${summary.from}&to=${summary.to}`}
                className="text-[12.5px] font-medium text-text-2 hover:text-text-1"
              >
                {totals.count === 1
                  ? "Open the one entry →"
                  : `Open these ${totals.count} entries →`}
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Figure({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "green" | "red" | "grey";
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <span
        className={cn(
          "grid size-7 place-items-center rounded-field",
          tone === "green" && "bg-status-green-dim text-status-green",
          tone === "red" && "bg-status-red-dim text-status-red",
          tone === "grey" && "bg-chip text-text-2",
        )}
      >
        {icon}
      </span>
      <div className="num mt-2 text-[24px] leading-none font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {label}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] leading-snug text-text-3">{sub}</div>}
    </div>
  );
}
