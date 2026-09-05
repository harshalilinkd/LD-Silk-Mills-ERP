"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconChevronLeft,
  IconChevronRight,
  IconReceipt,
  IconScale,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

import {
  addDays,
  addMonths,
  daysInMonth as daysInMonthOf,
  monthLabel,
  startOfMonth,
  weekdayName,
  weekdayOf,
} from "@/lib/dates";
import { formatMoney, toNumber } from "@/lib/petty-cash/money";
import type {
  DayTotals,
  MonthPoint,
  MonthSummary,
  PayeeRow,
  Totals,
} from "@/lib/petty-cash/queries";
import { cn } from "@/lib/utils";
import { PageHead, QuietButton, Select } from "@/components/ui/module-parts";
import { CashFlowChart, CategoryDonut } from "../charts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type View = "CREDIT" | "DEBIT" | "NET";

const VIEW_META: Record<View, { label: string; help: string }> = {
  CREDIT: { label: "Money in", help: "Only deposits into the box" },
  DEBIT: { label: "Money out", help: "Only payments out of the box" },
  NET: { label: "Both", help: "In and out on the same day" },
};

/**
 * The Petty Cash Dashboard — formerly "Analysis", one calendar and nothing
 * else. It answered "which day did that go out on" well and nothing beyond
 * it: no trend, no share-of-spend, no sense of whether this month is better
 * or worse than the last one. Everything below the calendar is new.
 *
 * ── WHAT "IN DEPTH" MEANS HERE, SPECIFICALLY ─────────────────────────────
 *
 * Every figure on this screen is one a bookkeeper would actually ask for:
 * the trend over the last six months (is the burn rate climbing), where this
 * period's money went (which category, what share), who it mostly goes to,
 * and how big a typical payment is. None of it is decorative — each number
 * has a "so what" a coordinator or an accountant can act on.
 *
 * ── TWO CLOCKS, DELIBERATELY ─────────────────────────────────────────────
 *
 * The cash-flow trend is always the real last six months ending TODAY — a
 * fixed, always-current "how are we trending" view, the way a CA's monthly
 * management pack never itself scrolls. The KPI strip, the category donut and
 * the calendar all describe whichever month the picker below is set to, so
 * drilling into March 2026 does not also rewrite the trend chart underneath
 * it into something about March.
 *
 * ── THE CALENDAR SURVIVES, DEMOTED ────────────────────────────────────────
 *
 * It is still the only shape that answers "which day", and there is no
 * reason to trade a well-reasoned feature for a new one when both jobs are
 * real. It moves under "Day by day", after the read of the whole month.
 */
export function DashboardScreen({
  days,
  totals,
  from,
  view,
  years,
  today,
  summary,
  trend,
  payees,
}: {
  days: DayTotals[];
  totals: Totals;
  from: string;
  to: string;
  view: View;
  years: number[];
  today: string;
  summary: MonthSummary;
  trend: MonthPoint[];
  payees: PayeeRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [y, m] = from.split("-").map(Number);
  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.date, d])),
    [days],
  );

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.push(`${pathname}?${next}`);
  };

  const yearOptions = [...new Set([...years, y])].sort((a, b) => b - a);

  // Every day of the month, padded so the 1st lands in its real column.
  const cells: (DayTotals | { date: string; empty: true } | null)[] = [];
  const lead = (weekdayOf(from) + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = from; d.slice(0, 7) === from.slice(0, 7); d = addDays(d, 1)) {
    cells.push(byDate.get(d) ?? { date: d, empty: true });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const busiest = Math.max(
    1,
    ...days.map((d) =>
      Math.max(toNumber(d.credits) ?? 0, toNumber(d.debits) ?? 0),
    ),
  );

  // ── the CA-style figures ────────────────────────────────────────────────
  const periodDebits = toNumber(totals.debits) ?? 0;
  const periodCount = totals.count;

  const byCategoryDesc = [...summary.byCategory].sort(
    (a, b) => (toNumber(b.debits) ?? 0) - (toNumber(a.debits) ?? 0),
  );
  const topCategory = byCategoryDesc[0];
  const topCategoryShare =
    topCategory && periodDebits > 0
      ? Math.round(((toNumber(topCategory.debits) ?? 0) / periodDebits) * 100)
      : null;

  const avgPayment = periodCount > 0 ? periodDebits / periodCount : 0;

  const daysInThisMonth = daysInMonthOf(y, m - 1);
  const activeDays = days.length;

  const thisTrend = trend[trend.length - 1];
  const prevTrend = trend.length > 1 ? trend[trend.length - 2] : null;
  const thisDebits = thisTrend ? toNumber(thisTrend.debits) ?? 0 : 0;
  const prevDebits = prevTrend ? toNumber(prevTrend.debits) ?? 0 : null;
  const momChange =
    prevDebits != null && prevDebits > 0
      ? Math.round(((thisDebits - prevDebits) / prevDebits) * 100)
      : null;

  const trendData = trend.map((p) => ({
    month: p.month,
    credits: toNumber(p.credits) ?? 0,
    debits: toNumber(p.debits) ?? 0,
    balance: toNumber(p.balance) ?? 0,
  }));

  const categoryDonutData = summary.byCategory.map((c) => ({
    name: c.categoryName,
    value: toNumber(c.debits) ?? 0,
  }));

  const topPayees = [...payees]
    .filter((p) => (toNumber(p.paid) ?? 0) > 0)
    .sort((a, b) => (toNumber(b.paid) ?? 0) - (toNumber(a.paid) ?? 0))
    .slice(0, 5);
  const topPayeesTotal = topPayees.reduce((s, p) => s + (toNumber(p.paid) ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Reporting"
        title="Analysis"
        lede="Where the money goes, how it's trending, and which day it moved — in one place."
      />

      {/* ── this period, in figures a bookkeeper would ask for ─────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CaFigure
          icon={<IconScale className="size-4" />}
          label="Net this period"
          value={formatMoney(totals.balance)}
          tone={(toNumber(totals.balance) ?? 0) < 0 ? "red" : "green"}
          sub={monthLabel(from)}
        />
        <CaFigure
          icon={<IconReceipt className="size-4" />}
          label="Top category"
          value={topCategory ? topCategory.categoryName : "—"}
          tone="grey"
          sub={
            topCategory && topCategoryShare != null
              ? `${formatMoney(topCategory.debits)} · ${topCategoryShare}% of spend`
              : "Nothing paid out yet"
          }
        />
        <CaFigure
          icon={<IconUsers className="size-4" />}
          label="Average payment"
          value={periodCount > 0 ? formatMoney(avgPayment) : "—"}
          tone="grey"
          sub={`Across ${periodCount.toLocaleString("en-IN")} ${periodCount === 1 ? "entry" : "entries"}`}
        />
        <CaFigure
          icon={momChange == null ? <IconScale className="size-4" /> : momChange > 0 ? (
            <IconTrendingUp className="size-4" />
          ) : (
            <IconTrendingDown className="size-4" />
          )}
          label="Vs last month"
          value={momChange == null ? "—" : `${momChange > 0 ? "+" : ""}${momChange}%`}
          tone={momChange == null ? "grey" : momChange > 0 ? "red" : "green"}
          sub={momChange == null ? "Not enough history yet" : "Money paid out, month over month"}
        />
      </div>

      {/* ── the trend, always the real last six months ──────────────────── */}
      <section className="rounded-card border border-border bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              Cash flow
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Last six months
            </h2>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-text-3">
            <Key colour="bg-status-green" label="In" />
            <Key colour="bg-status-red" label="Out" />
            <Key colour="bg-accent-text" label="Net" />
          </div>
        </div>
        <div className="px-2 pt-3 pb-1 sm:px-4">
          <CashFlowChart data={trendData} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── where this period's money went ─────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              This period
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Spend by category
            </h2>
          </div>
          <div className="px-4 py-4">
            <CategoryDonut data={categoryDonutData} />
          </div>
        </section>

        {/* ── who it mostly goes to ────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              All time
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Top payees
            </h2>
          </div>
          {topPayees.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-text-3">
              Nothing paid out yet.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {topPayees.map((p) => {
                const paid = toNumber(p.paid) ?? 0;
                const pct = topPayeesTotal ? Math.round((paid / topPayeesTotal) * 100) : 0;
                return (
                  <div key={p.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-text-1">
                        {p.name}
                      </span>
                      <span className="num shrink-0 text-[12.5px] font-bold text-text-1">
                        {formatMoney(paid)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-3">
                        <div
                          className="h-full rounded-pill bg-status-red/70"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                      <span className="num shrink-0 text-[11px] text-text-3">
                        {p.used} {p.used === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── which day, exactly ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              Day by day
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              {monthLabel(from)}
            </h2>
          </div>
          <span className="text-[11.5px] text-text-3">
            {activeDays} of {daysInThisMonth} days had activity
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-field border border-border bg-surface p-2.5">
          <div className="flex items-center gap-1">
            {(Object.keys(VIEW_META) as View[]).map((v) => {
              const on = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  title={VIEW_META[v].help}
                  onClick={() => set({ view: v })}
                  className={cn(
                    "cursor-pointer rounded-pill border px-3 py-1 text-[12.5px] font-medium transition-colors",
                    on
                      ? "border-primary/40 bg-primary text-primary-foreground"
                      : "border-border bg-surface-2 text-text-2 hover:text-text-1",
                  )}
                >
                  {VIEW_META[v].label}
                </button>
              );
            })}
          </div>

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

          <QuietButton
            aria-label="Previous month"
            className="h-9"
            onClick={() => set({ month: addMonths(from, -1) })}
          >
            <IconChevronLeft className="size-4" />
          </QuietButton>

          <Select
            aria-label="Month"
            className="w-auto min-w-[150px]"
            value={String(m)}
            onChange={(e) =>
              set({ month: `${y}-${String(Number(e.target.value)).padStart(2, "0")}-01` })
            }
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
            onChange={(e) => set({ month: `${e.target.value}-${String(m).padStart(2, "0")}-01` })}
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
            onClick={() => set({ month: addMonths(from, 1) })}
          >
            <IconChevronRight className="size-4" />
          </QuietButton>

          <QuietButton className="h-9" onClick={() => set({ month: startOfMonth(today) })}>
            This month
          </QuietButton>
        </div>

        {/* ── on a phone, the days that had money ──────────────────────── */}
        {/*
          A seven-column grid with rupee figures in it is a desktop layout. At
          390px each cell is 45px wide and "+ ₹10,000" wraps onto three lines.
          Below `sm` the same data is a list instead: only the days that had
          activity, opening the same day when tapped.
        */}
        <section className="rounded-card border border-border bg-surface sm:hidden">
          {days.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-text-3">
              Nothing was recorded in {monthLabel(from)}.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {days.map((day) => {
                const credits = toNumber(day.credits) ?? 0;
                const debits = toNumber(day.debits) ?? 0;
                return (
                  <li key={day.date}>
                    <button
                      type="button"
                      onClick={() => router.push(`/petty-cash?on=${day.date}`)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="flex w-11 shrink-0 flex-col items-center">
                        <span className="num text-[17px] leading-none font-bold text-text-1">
                          {Number(day.date.slice(8, 10))}
                        </span>
                        <span className="mt-0.5 text-[10px] font-semibold tracking-[0.04em] text-text-3 uppercase">
                          {weekdayName(day.date).slice(0, 3)}
                        </span>
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {view !== "DEBIT" && credits > 0 && (
                          <span className="num text-[13px] font-semibold text-status-green">
                            + {formatMoney(credits)}
                          </span>
                        )}
                        {view !== "CREDIT" && debits > 0 && (
                          <span className="num text-[13px] font-semibold text-status-red">
                            − {formatMoney(debits)}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 text-[11.5px] text-text-3">
                        {day.count} {day.count === 1 ? "entry" : "entries"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="hidden rounded-card border border-border bg-surface p-4 sm:block">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold tracking-[0.06em] text-text-3 uppercase"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((cell, ci) => {
                  if (cell === null) return <div key={ci} className="min-h-[74px]" />;
                  const has = !("empty" in cell);
                  const credits = has ? (toNumber(cell.credits) ?? 0) : 0;
                  const debits = has ? (toNumber(cell.debits) ?? 0) : 0;
                  const showCredit = view !== "DEBIT" && credits > 0;
                  const showDebit = view !== "CREDIT" && debits > 0;
                  const active = showCredit || showDebit;
                  const weight = Math.max(credits, debits) / busiest;

                  return (
                    <button
                      key={ci}
                      type="button"
                      disabled={!has}
                      onClick={() => router.push(`/petty-cash?on=${cell.date}`)}
                      title={
                        has
                          ? `${cell.date} — in ${formatMoney(cell.credits)}, out ${formatMoney(cell.debits)}, ${cell.count} ${cell.count === 1 ? "entry" : "entries"}`
                          : undefined
                      }
                      className={cn(
                        "flex min-h-[74px] flex-col rounded-md border p-1.5 text-left transition-colors",
                        has
                          ? "cursor-pointer border-border bg-surface-2 hover:border-primary/40"
                          : "cursor-default border-transparent",
                        cell.date === today && "ring-2 ring-primary ring-offset-1 ring-offset-[var(--surface)]",
                      )}
                    >
                      <span
                        className={cn(
                          "num text-[11.5px] font-bold",
                          active ? "text-text-1" : "text-text-3",
                        )}
                      >
                        {Number(cell.date.slice(8, 10))}
                      </span>

                      {showCredit && (
                        <span className="num mt-1 text-[11px] leading-tight font-semibold text-status-green">
                          + {compact(credits)}
                        </span>
                      )}
                      {showDebit && (
                        <span className="num mt-0.5 text-[11px] leading-tight font-semibold text-status-red">
                          − {compact(debits)}
                        </span>
                      )}

                      {active && (
                        <span className="mt-auto block h-1 w-full overflow-hidden rounded-pill bg-surface-3">
                          <span
                            className={cn(
                              "block h-full rounded-pill",
                              showDebit && debits >= credits
                                ? "bg-status-red/70"
                                : "bg-status-green/70",
                            )}
                            style={{ width: `${Math.max(6, Math.round(weight * 100))}%` }}
                          />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="mt-3 border-t border-border pt-2.5 text-[11.5px] text-text-3">
            Each day shows what went in and out on{" "}
            <strong className="font-semibold text-text-2">that date</strong> — the
            date on the entry, not when it was typed in. Click a day to open its
            entries.
          </p>
        </section>
      </section>
    </div>
  );
}

/**
 * `₹10,000` in a calendar cell, `₹1,250.50` when there really are paise. A
 * calendar cell is 74px wide and holds two of these, so a trailing `.00` on
 * every whole rupee amount costs three characters that say nothing.
 */
function compact(n: number): string {
  const full = formatMoney(n);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", colour)} />
      {label}
    </span>
  );
}

function CaFigure({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
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
      <div className="mt-2 truncate text-[20px] leading-none font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11.5px] leading-snug text-text-3">{sub}</div>
    </div>
  );
}
