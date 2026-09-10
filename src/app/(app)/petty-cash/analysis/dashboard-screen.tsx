"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconChevronLeft,
  IconChevronRight,
  IconReceipt,
  IconMinus,
  IconScale,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

import {
  addDays,
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
import { PageHead, QuietButton } from "@/components/ui/module-parts";
import { CashFlowChart, CategoryDonut, GroupBarChart } from "../charts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type View = "CREDIT" | "DEBIT" | "NET";

/**
 * Credit, Debit, Net - the owner's words, and the accounting ones.
 *
 * These buttons used to read "Money in / Money out / Both", which is plainer
 * English and is still what the ENTRY FORM says, because a person recording a
 * payment is not thinking in ledger terms. On an analysis screen the reader is
 * a bookkeeper, the figures above are already headed CREDIT and DEBIT, and one
 * screen calling the same thing two names is the thing to avoid.
 *
 * `heading` is what the calendar prints beside the month, so the button you
 * pressed and the title you are reading always use the same word.
 */
const VIEW_META: Record<
  View,
  { label: string; heading: string; help: string }
> = {
  CREDIT: {
    label: "Credit",
    heading: "Credit Analysis",
    help: "Only deposits into the box",
  },
  DEBIT: {
    label: "Debit",
    heading: "Debit Analysis",
    help: "Only payments out of the box",
  },
  NET: {
    label: "Net",
    heading: "Net Analysis (All)",
    help: "In and out on the same day",
  },
};

/**
 * The year and its twelve months, down the left of the calendar.
 *
 * It replaces a month dropdown, a year dropdown and a pair of step arrows with
 * one list you can see all of: picking August is one click from September
 * rather than opening a select and finding it. ALL TWELVE ARE ALWAYS THERE,
 * including months with nothing in them - an empty February is an answer, and
 * a rail that changes length as entries arrive is one nobody can build a habit
 * on.
 *
 * On a phone the same list lies on its side as a scrolling strip of short
 * names, because a 12-row column would push the calendar off the screen.
 */
function MonthRail({
  year,
  month,
  onMonth,
  onYear,
}: {
  year: number;
  month: number;
  onMonth: (m: number) => void;
  onYear: (delta: number) => void;
}) {
  // ── THE CHOSEN MONTH HAS TO BE ON SCREEN ────────────────────────────────
  //
  // Sideways on a phone, the strip starts at January, so opening the page in
  // September showed Jan-Jul and the highlighted month was off the right edge
  // — the one thing the rail exists to tell you. The container is scrolled
  // directly rather than through `scrollIntoView`, which on the DESKTOP rail
  // would scroll the whole page to reach a month that was already visible.
  const strip = React.useRef<HTMLDivElement>(null);
  const current = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const box = strip.current;
    const btn = current.current;
    if (!box || !btn || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = btn.offsetLeft - box.clientWidth / 2 + btn.clientWidth / 2;
  }, [month, year]);

  return (
    <aside className="shrink-0 overflow-hidden rounded-card border border-border bg-surface lg:w-[170px]">
      <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
        <QuietButton
          aria-label="Previous year"
          className="size-7 p-0"
          onClick={() => onYear(-1)}
        >
          <IconChevronLeft className="size-4" />
        </QuietButton>
        <span className="num text-[13px] font-bold text-text-1">{year}</span>
        <QuietButton
          aria-label="Next year"
          className="size-7 p-0"
          onClick={() => onYear(1)}
        >
          <IconChevronRight className="size-4" />
        </QuietButton>
      </div>

      <div
        ref={strip}
        className="flex gap-1 overflow-x-auto p-1.5 lg:flex-col lg:gap-0 lg:overflow-x-visible lg:p-0"
      >
        {MONTHS.map((name, i) => {
          const on = i + 1 === month;
          return (
            <button
              key={name}
              ref={on ? current : undefined}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onMonth(i + 1)}
              className={cn(
                "shrink-0 cursor-pointer rounded-pill px-3 py-1.5 text-[12.5px] transition-colors",
                "lg:rounded-none lg:border-b lg:border-border lg:px-4 lg:py-2.5 lg:text-left lg:last:border-b-0",
                on
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-text-2 hover:bg-surface-2 hover:text-text-1",
              )}
            >
              <span className="lg:hidden">{name.slice(0, 3)}</span>
              <span className="hidden lg:inline">{name}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/**
 * The Petty Cash Dashboard — formerly "Analysis", one calendar and nothing
 * else. It answered "which day did that go out on" well and nothing beyond
 * it: no trend, no share-of-spend, no sense of whether this month is better
 * or worse than the last one. Everything except the calendar is new.
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
 * ── THE CALENDAR IS SECOND, NOT LAST ─────────────────────────────────────
 *
 * It was put below the charts when this screen grew from one calendar into a
 * dashboard, reasoning that the month as a whole should be read before any
 * single day of it. The owner reads it the other way round, and they are the
 * one using it: the figure strip says what the month DID, and the very next
 * question is WHICH DAY. The trend, the split and the payee ranking are all
 * follow-ups to that, so they come after it.
 *
 * Order on the page: figures → the calendar → six-month trend → category and
 * group split → top payees.
 */
export function DashboardScreen({
  days,
  totals,
  from,
  view,
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

  // Every day of the month, padded so the 1st lands in its real column.
  const cells: (DayTotals | { date: string; empty: true } | null)[] = [];
  // SUNDAY FIRST, which is how the old system's calendar reads and how the
  // wall calendar in the office reads. `weekdayOf` is getUTCDay, so Sunday is
  // already 0 - the `+ 6` rotation that produced a Monday-first grid comes out
  // rather than something being added.
  const lead = weekdayOf(from);
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = from; d.slice(0, 7) === from.slice(0, 7); d = addDays(d, 1)) {
    cells.push(byDate.get(d) ?? { date: d, empty: true });
  }
  while (cells.length % 7 !== 0) cells.push(null);

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

  // What the line beside the title totals: the figure the chosen view is ABOUT.
  // Net is the balance, which is the one the old screen printed.
  const viewTotal =
    view === "CREDIT"
      ? (toNumber(totals.credits) ?? 0)
      : view === "DEBIT"
        ? (toNumber(totals.debits) ?? 0)
        : (toNumber(totals.balance) ?? 0);

  const daysInThisMonth = daysInMonthOf(y, m - 1);
  const activeDays = days.length;

  const thisTrend = trend[trend.length - 1];
  const prevTrend = trend.length > 1 ? trend[trend.length - 2] : null;
  const thisDebits = thisTrend ? (toNumber(thisTrend.debits) ?? 0) : 0;
  const prevDebits = prevTrend ? (toNumber(prevTrend.debits) ?? 0) : null;
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

  const groupBarData = summary.byGroup.map((g) => ({
    name: g.groupName,
    value: toNumber(g.debits) ?? 0,
  }));

  const topPayees = [...payees]
    .filter((p) => (toNumber(p.paid) ?? 0) > 0)
    .sort((a, b) => (toNumber(b.paid) ?? 0) - (toNumber(a.paid) ?? 0))
    .slice(0, 5);
  const topPayeesTotal = topPayees.reduce(
    (s, p) => s + (toNumber(p.paid) ?? 0),
    0,
  );

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
          icon={
            // Not the scale — that is "Net this period" two cards along, and
            // repeating an icon makes two different figures look like one.
            momChange == null ? (
              <IconMinus className="size-4" />
            ) : momChange > 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )
          }
          label="Vs last month"
          value={
            momChange == null ? "—" : `${momChange > 0 ? "+" : ""}${momChange}%`
          }
          tone={momChange == null ? "grey" : momChange > 0 ? "red" : "green"}
          sub={
            momChange == null
              ? "Not enough history yet"
              : "Money paid out, month over month"
          }
        />
      </div>

      {/* ── which day, exactly ────────────────────────────────── */}
      {/*
        THE OLD SYSTEM'S SHAPE, IN THIS SYSTEM'S COLOURS.

        Year and twelve months down the left, the month and what you are
        looking at across the top, the period's total on the right of that same
        line, and the grid under it running Sunday to Saturday. What changed on
        the way across is the palette and nothing else: credit is the green this
        ERP uses for money in everywhere, debit the red it uses for money out,
        and today keeps the primary ring rather than a filled disc.

        The month dropdown, the year dropdown and the two step arrows are gone,
        replaced by the rail. Three controls became one list you can see all of.
      */}
      <section className="flex flex-col gap-3">
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
            className="h-9"
            onClick={() => set({ month: startOfMonth(today) })}
          >
            This month
          </QuietButton>

          <span className="ml-auto text-[11.5px] text-text-2">
            {activeDays} of {daysInThisMonth} days had activity
          </span>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <MonthRail
            year={y}
            month={m}
            onMonth={(next) =>
              set({ month: `${y}-${String(next).padStart(2, "0")}-01` })
            }
            onYear={(delta) =>
              set({
                month: `${y + delta}-${String(m).padStart(2, "0")}-01`,
              })
            }
          />

          <div className="min-w-0 flex-1 rounded-card border border-border bg-surface">
            {/*
              "September - Credit Analysis" with the total on the same line.
              The month is the neutral ink and the view is the accent, so the
              part that changes when you press a button is the part that looks
              like it changes.
            */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-bold text-text-1">
                {MONTHS[m - 1]}{" "}
                <span className="font-normal text-text-3">—</span>{" "}
                <span className="text-primary">{VIEW_META[view].heading}</span>
              </h2>
              <span className="text-[12.5px] text-text-3">
                Total{" "}
                <strong className="num text-[13.5px] font-bold text-text-1">
                  {formatMoney(viewTotal)}
                </strong>
              </span>
            </div>

            {/* ── on a phone, the days that had money ────────────── */}
            {/*
              A seven-column grid with rupee figures in it is a desktop layout.
              At 390px each cell is 45px wide and "+ ₹10,000" wraps onto three
              lines — and it doesn't get much better up to 1024px, so the
              switch is `lg`, not `sm`; a phone in landscape or a small tablet
              got the cramped grid under `sm` and that is what this was
              fixing. Below `lg` the same data is a list instead: only the
              days that had activity, opening the same day when tapped.
            */}
            <div className="lg:hidden">
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
                          onClick={() =>
                            router.push(`/petty-cash?on=${day.date}`)
                          }
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
            </div>

            <div className="hidden p-4 lg:block">
              {/*
                ONE CONTINUOUS GRID, NOT THIRTY FLOATING TILES.

                The days used to be separate rounded cards with a gap between
                them, and only the days that had money got a visible border -
                so an empty week read as blank paper and the eye had nothing to
                follow across a row. A calendar is a TABLE; every date gets the
                same bordered cell whether anything happened in it or not.

                The lines are drawn with a 1px GAP over a `bg-border` panel
                rather than a border on each cell. Per-cell borders double up
                where two cells meet - a 2px line inside and 1px at the edges -
                and fixing that needs nth-child rules that break the moment a
                month starts on a different weekday. A gap cannot double.
              */}
              <div className="overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-7 gap-px bg-border">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d) => (
                      <div
                        key={d}
                        className="bg-surface-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] text-text-2 uppercase"
                      >
                        {d}
                      </div>
                    ),
                  )}

                  {cells.map((cell, i) => {
                    // The days either side of the month. They keep their cell -
                    // a hole in the grid is a broken table - and are shaded so
                    // the month itself still reads as one block.
                    if (cell === null)
                      return (
                        <div
                          key={`pad-${i}`}
                          className="min-h-[88px] bg-surface-2/60"
                        />
                      );

                    const has = !("empty" in cell);
                    const credits = has ? (toNumber(cell.credits) ?? 0) : 0;
                    const debits = has ? (toNumber(cell.debits) ?? 0) : 0;
                    const showCredit = view !== "DEBIT" && credits > 0;
                    const showDebit = view !== "CREDIT" && debits > 0;
                    const active = showCredit || showDebit;
                    const weight = Math.max(credits, debits) / busiest;

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        disabled={!has}
                        onClick={() =>
                          router.push(`/petty-cash?on=${cell.date}`)
                        }
                        title={
                          has
                            ? `${cell.date} — in ${formatMoney(cell.credits)}, out ${formatMoney(cell.debits)}, ${cell.count} ${cell.count === 1 ? "entry" : "entries"}`
                            : undefined
                        }
                        className={cn(
                          "flex min-h-[88px] flex-col p-2 text-left transition-colors",
                          has
                            ? "cursor-pointer bg-surface hover:bg-surface-2"
                            : "cursor-default bg-surface",
                          // An INSET ring, so today is marked without a glow
                          // that overlaps the two cells beside it - which is
                          // what a plain ring does inside a 1px grid.
                          cell.date === today &&
                            "shadow-[inset_0_0_0_2px_var(--primary)]",
                        )}
                      >
                        {/*
                          Top RIGHT, the way a wall calendar and the system this
                          replaced both number their days. It also leaves the
                          left edge clear for the figures, which is where the
                          eye goes for money.
                        */}
                        <span
                          className={cn(
                            "num self-end text-[12px] leading-none font-bold",
                            cell.date === today
                              ? "text-primary"
                              : active
                                ? "text-text-1"
                                : "text-text-3",
                          )}
                        >
                          {Number(cell.date.slice(8, 10))}
                        </span>

                        {showCredit && (
                          <span className="num mt-1.5 text-[11.5px] leading-tight font-semibold text-status-green">
                            + {compact(credits)}
                          </span>
                        )}
                        {showDebit && (
                          <span className="num mt-0.5 text-[11.5px] leading-tight font-semibold text-status-red">
                            − {compact(debits)}
                          </span>
                        )}

                        {active && (
                          <span className="mt-auto block h-[3px] w-full overflow-hidden rounded-pill bg-surface-3">
                            <span
                              className={cn(
                                "block h-full rounded-pill",
                                showDebit && debits >= credits
                                  ? "bg-status-red/70"
                                  : "bg-status-green/70",
                              )}
                              style={{
                                width: `${Math.max(6, Math.round(weight * 100))}%`,
                              }}
                            />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="mt-3 text-[11.5px] text-text-2">
                Each day shows what went in and out on{" "}
                <strong className="font-semibold text-text-2">that date</strong>{" "}
                — the date on the entry, not when it was typed in. Click a day
                to open its entries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── the trend, always the real last six months ──────────────────── */}
      <section className="rounded-card border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
            Cash flow
          </div>
          <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
            Last six months
          </h2>
        </div>
        <div className="px-2 pt-3 pb-1 sm:px-4">
          <CashFlowChart data={trendData} />
        </div>
      </section>

      {/*
        The two cards stretch to the taller of them, and the bar chart sizes
        itself to its own rows - so two groups beside a donut left a quarter of
        a screen of nothing under the bars. Both bodies now CENTRE their chart
        in whatever height the pair settles on: it costs nothing when they
        happen to match, and fixes the void when they do not.
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── where this period's money went ─────────────────────────────── */}
        <section className="flex flex-col rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
              This period
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Spend by category
            </h2>
          </div>
          <div className="flex flex-1 items-center px-4 py-4">
            <div className="w-full">
              <CategoryDonut data={categoryDonutData} />
            </div>
          </div>
        </section>

        {/* ── the same money, ranked by heading instead of sliced ─────────── */}
        <section className="flex flex-col rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
              This period
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Spend by group
            </h2>
          </div>
          <div className="flex flex-1 items-center px-4 py-4">
            <div className="w-full">
              <GroupBarChart data={groupBarData} />
            </div>
          </div>
        </section>
      </div>

      {/* ── who it mostly goes to ──────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
            All time
          </div>
          <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
            Top payees
          </h2>
        </div>
        {topPayees.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-text-2">
            Nothing paid out yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {topPayees.map((p) => {
              const paid = toNumber(p.paid) ?? 0;
              const pct = topPayeesTotal
                ? Math.round((paid / topPayeesTotal) * 100)
                : 0;
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
                        // PRIMARY, not red. Red means "late, critical, act on
                        // this" everywhere else in this ERP, and the biggest
                        // payee is not a warning - it is usually the canteen.
                        // The donut two cards up already draws the same money
                        // in teal, so red here made one figure look like two.
                        className="h-full rounded-pill bg-primary/70"
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
    // Label and mark share the top line; the figure gets the row under it.
    // The icon used to sit alone on a line of its own, which spent a whole row
    // on decoration and pushed the figure - the only thing anybody reads at a
    // glance - into the middle of the card. This is also the shape of the
    // system this module replaces: measure on the left, mark on the right,
    // number below.
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="mt-1 text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
          {label}
        </div>
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-field",
            tone === "green" && "bg-status-green-dim text-status-green",
            tone === "red" && "bg-status-red-dim text-status-red",
            tone === "grey" && "bg-chip text-text-2",
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2.5 truncate text-[22px] leading-none font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-1.5 truncate text-[11.5px] leading-snug text-text-2">
        {sub}
      </div>
    </div>
  );
}
