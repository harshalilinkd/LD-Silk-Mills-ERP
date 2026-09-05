"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowDownRight,
  IconArrowRight,
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconClockHour4,
  IconDownload,
  IconFileText,
  IconFlame,
  IconMinus,
  IconPrinter,
  IconRotate,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
  IconUserQuestion,
} from "@tabler/icons-react";

import {
  addDays,
  addMonths,
  endOfMonth,
  financialYearOf,
  formatDate,
  monthLabel,
  startOfMonth,
  weekdayOf,
} from "@/lib/checklist/dates";
import {
  GRADE_SCALE_TOOLTIP,
  gradeFor,
  scoreParts,
  trendDirection,
} from "@/lib/checklist/grade";
import { FREQUENCY_META } from "@/lib/checklist/frequency";
import type { DayCell, Scorecard } from "@/lib/checklist/scorecard-query";
import { cn } from "@/lib/utils";
import { useChecklistViewer } from "../viewer-context";
import {
  Donut,
  EmptyState,
  Input,
  PageHead,
  QuietButton,
  RankBadge,
  Select,
  TableCard,
} from "../parts";

/**
 * A scorecard.
 *
 * ── IT IS A RECORD OF A PERSON, SO IT IS BUILT TO BE ARGUED WITH ─────────
 *
 * Every figure prints the rule that produced it and the count it came from,
 * and the composite score at the top breaks itself into its three parts rather
 * than arriving as a verdict. Somebody shown a 28/100 should be able to see,
 * without asking, that it is half on-time work, three-tenths how much got
 * done, and two-tenths their best run — and to point at the one that is wrong.
 *
 * ── EMPTY IS DRAWN AS EMPTY, NOT AS ZERO ─────────────────────────────────
 *
 * A month with nothing ticked off yet has no on-time percentage. It shows a
 * dash. Printing "0%" in red would be a judgement the data does not support,
 * and it is the first thing somebody would see.
 */
export function ScorecardScreen({
  data,
  people,
  from,
  to,
  reason,
}: {
  data: Scorecard | null;
  people: { id: number; name: string; department: string | null }[];
  from: string;
  to: string;
  reason?: string;
}) {
  const viewer = useChecklistViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(next.toString() ? `${pathname}?${next}` : pathname);
  };

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead eyebrow="Performance" title="Scorecards" />
        <TableCard
          empty={
            <EmptyState
              icon={<IconUserQuestion className="size-5" />}
              title="Nothing to show"
              body={reason}
            />
          }
        />
      </div>
    );
  }

  const k = data.kpis;
  const prev = data.previousKpis;

  const presets = lastSixMonths(data.today);
  const grade = gradeFor(k.reliability);
  const parts = scoreParts(k);
  const trend = trendDirection(data.trend.map((m) => m.onTimePct));

  const csvHref = `/checklist/scorecards/export?doer=${data.doer.id}&from=${from}&to=${to}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Performance"
        title="Scorecards"
        lede={
          viewer.isAdmin
            ? "One person's record over a period. Every figure says what it is a figure of."
            : "Your own record. Every figure says what it is a figure of."
        }
        action={
          <>
            <QuietButton onClick={() => window.print()}>
              <IconPrinter className="size-3.5" />
              Print
            </QuietButton>
            <a
              href={csvHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
            >
              <IconDownload className="size-3.5" />
              Export CSV
            </a>
          </>
        }
      />

      {/* ── who and when, in one row ────────────────────────────────── */}
      {/* The three quick ranges were a second strip under a four-column grid —
          two bands of controls before the person's name appeared. They are
          pills on the same line now, and the captions are gone because every
          control here already says what it is. */}
      <div className="flex flex-wrap items-center gap-2 rounded-field border border-border bg-surface p-2.5">
        {viewer.isAdmin && (
          <Select
            aria-label="Doer"
            className="w-auto min-w-[180px] flex-1 sm:flex-none"
            value={String(data.doer.id)}
            onChange={(e) => setParam({ doer: e.target.value })}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.department ? ` · ${p.department}` : ""}
              </option>
            ))}
          </Select>
        )}

        <Select
          aria-label="Month"
          className="w-auto min-w-[140px] flex-1 sm:flex-none"
          value={from === startOfMonth(from) && to === endOfMonth(from) ? from : ""}
          onChange={(e) => {
            if (!e.target.value) return;
            setParam({ from: e.target.value, to: endOfMonth(e.target.value) });
          }}
        >
          <option value="">Custom range</option>
          {presets.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </Select>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <Input
            type="date"
            aria-label="From date"
            className="num min-w-0 flex-1 sm:w-[148px] sm:flex-none"
            value={from}
            max={to}
            onChange={(e) => setParam({ from: e.target.value || null })}
          />
          <span className="text-text-3">–</span>
          <Input
            type="date"
            aria-label="To date"
            className="num min-w-0 flex-1 sm:w-[148px] sm:flex-none"
            value={to}
            min={from}
            onChange={(e) => setParam({ to: e.target.value || null })}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {QUICK_RANGES(data.today).map((r) => {
            const on = from === r.from && to === r.to;
            return (
              <button
                key={r.label}
                type="button"
                title={r.hint}
                onClick={() => setParam({ from: r.from, to: r.to })}
                className={cn(
                  "cursor-pointer rounded-pill border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  on
                    ? "border-primary/40 bg-primary text-primary-foreground"
                    : "border-border bg-surface-2 text-text-2 hover:text-text-1",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the person, and the composite ───────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-accent-text">
            {initials(data.doer.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-bold tracking-[-0.01em] text-text-1">
              {data.doer.name}
            </h2>
            <p className="truncate text-[12.5px] text-text-3">
              {data.doer.department ? `${data.doer.department} · ` : ""}
              {data.doer.email}
            </p>
            <p className="mt-0.5 text-[12px] text-text-3">
              {formatDate(from)} – {formatDate(to)} · {data.period.days} days
            </p>
          </div>
        </div>

        {/* ── the score, and what it is made of ─────────────────────── */}
        {/* The three parts print POINTS OUT OF THEIR OWN MAXIMUM — 50, 30, 20
            — so they add up to the number beside them. Three percentages that
            did not add to the total is how somebody decides the score is
            arbitrary and stops trusting the screen. */}
        <div className="flex items-center gap-4 rounded-card border border-border bg-surface-2 px-4 py-3">
          <div className="text-center">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              Reliability
            </div>
            <div className="flex items-baseline justify-center gap-0.5">
              <span
                className={cn(
                  "num text-[32px] leading-none font-bold tracking-[-0.02em]",
                  grade.text,
                )}
              >
                {k.reliability ?? "—"}
              </span>
              <span className="text-[11px] text-text-3">/100</span>
            </div>
            <span
              title={GRADE_SCALE_TOOLTIP}
              className={cn(
                "mt-1 inline-block cursor-help rounded-pill px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] uppercase",
                grade.chip,
                grade.text,
              )}
            >
              {grade.label}
            </span>
          </div>
          <div className="hidden w-px self-stretch bg-border md:block" />
          <div className="hidden flex-col gap-1 md:flex">
            {parts.map((p) => (
              <div
                key={p.label}
                title={p.hint}
                className="flex w-52 cursor-help items-center gap-2 text-[11px]"
              >
                <span className="w-[68px] shrink-0 text-text-3">{p.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-3">
                  <span
                    className={cn("block h-full rounded-pill", grade.bar)}
                    style={{ width: `${(p.points / p.max) * 100}%` }}
                  />
                </span>
                <span className="num w-9 shrink-0 text-right font-semibold text-text-2">
                  {p.points}
                  <span className="font-normal text-text-3">/{p.max}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── the five figures ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Figure
          icon={<IconFileText className="size-4" />}
          label="Total scheduled"
          value={k.total.toLocaleString("en-IN")}
          sub={`${k.due.toLocaleString("en-IN")} have come round so far`}
        />
        <Figure
          icon={<IconCircleCheck className="size-4" />}
          label="Completed"
          value={k.done.toLocaleString("en-IN")}
          sub={`${k.onTime} on time, ${k.late} late`}
          delta={k.done - prev.done}
        />
        <Figure
          icon={<IconTargetArrow className="size-4" />}
          label="On-time %"
          value={k.onTimePct === null ? "—" : `${k.onTimePct}%`}
          sub={
            k.onTimePct === null
              ? "Nothing ticked off yet"
              : `Of the ${k.done} ticked off`
          }
          delta={
            k.onTimePct !== null && prev.onTimePct !== null
              ? k.onTimePct - prev.onTimePct
              : undefined
          }
          suffix="%"
          tone={k.onTimePct === null ? undefined : k.onTimePct >= 80 ? "good" : k.onTimePct >= 60 ? "warn" : "bad"}
        />
        <Figure
          icon={<IconClockHour4 className="size-4" />}
          label="Avg delay"
          value={k.avgDelay > 0 ? `${k.avgDelay}d` : "—"}
          sub={k.late > 0 ? `Over the ${k.late} finished late` : "Nothing finished late"}
          delta={prev.avgDelay > 0 || k.avgDelay > 0 ? k.avgDelay - prev.avgDelay : undefined}
          suffix="d"
          lowerIsBetter
        />
        <Figure
          icon={<IconFlame className="size-4" />}
          label="Best streak"
          value={String(k.bestStreak)}
          sub={`In a row, on time · ${k.currentStreak} running now`}
        />
      </div>

      {/* ── LEFT COLUMN STACKS, RIGHT COLUMN IS THE CALENDAR ──────── */}
      {/* Making one short card stretch to a tall neighbour just moves the
          empty space inside it — the trend bars grew to six storeys and
          still said nothing more. The reference solves it by stacking two
          cards against the calendar, so both columns are full of content
          rather than one being full of air. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <div className="flex flex-col gap-4">
        {/* ── six-month trend ───────────────────────────────────────── */}
        {/* `h-full` + `flex-col` so the chart GROWS into whatever height the
            heatmap beside it takes. Without it the bars kept their 96px and
            the rest of the card was dead space — which is half of what the
            owner was pointing at. */}
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                Trend
              </div>
              <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                6 months · on-time %
              </h3>
            </div>
            {trend.delta !== null && (
              <span
                title="First month with data compared with the latest. A move of two points or less is called steady, because month-to-month noise on a handful of tasks moves it that much on its own."
                className={cn(
                  "inline-flex cursor-help items-center gap-1 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold",
                  trend.tone === "green" && "bg-status-green-dim text-status-green",
                  trend.tone === "red" && "bg-status-red-dim text-status-red",
                  trend.tone === "grey" && "bg-chip text-text-2",
                )}
              >
                {trend.tone === "green" ? (
                  <IconTrendingUp className="size-3.5" />
                ) : trend.tone === "red" ? (
                  <IconTrendingDown className="size-3.5" />
                ) : (
                  <IconMinus className="size-3.5" />
                )}
                {trend.label}
                {trend.delta !== 0 && ` ${trend.delta > 0 ? "+" : ""}${trend.delta}%`}
              </span>
            )}
          </div>
          <div className="relative flex items-end gap-2 px-4 pt-4">
            {/* Six dashes over six invisible two-pixel bars is not a chart,
                it is a card that looks broken. When there is nothing to plot,
                say which of the two reasons it is. */}
            {data.trend.every((m) => m.onTimePct === null) && (
              <p className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 text-center text-[12.5px] leading-relaxed text-text-3">
                {data.trend.every((m) => m.total === 0)
                  ? "Nothing was scheduled for this person in the last six months."
                  : "Nothing has been ticked off in the last six months, so there is no on-time figure to plot yet."}
              </p>
            )}
            {data.trend.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[11.5px] font-bold text-text-2">
                  {m.onTimePct === null ? "—" : `${m.onTimePct}%`}
                </span>
                <div className="flex h-28 w-full items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-sm",
                      m.onTimePct === null
                        ? "bg-surface-3"
                        : m.onTimePct >= 80
                          ? "bg-status-green"
                          : m.onTimePct >= 60
                            ? "bg-status-amber"
                            : "bg-status-red",
                    )}
                    style={{ height: `${Math.max(2, m.onTimePct ?? 0)}%` }}
                    title={`${m.label}: ${m.done} of ${m.total} done`}
                  />
                </div>
                <span className="text-[10.5px] text-text-3">{m.label.slice(0, 3)}</span>
                <span className="num text-[10px] text-text-3">{m.done}</span>
              </div>
            ))}
          </div>
          <p className="px-4 pt-2 pb-3 text-[11.5px] leading-snug text-text-3">
            A dash means nothing was ticked off that month — which is not the
            same as nothing being on time. The small figure is how many were
            done.
          </p>
        </section>

        {/* ── weekday pattern ───────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              By weekday
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Which days go well
            </h3>
          </div>
          <div className="flex flex-col gap-1.5 px-4 py-3.5">
            {data.weekdays.map((w) => {
              const max = Math.max(...data.weekdays.map((x) => x.total), 1);
              return (
                <div key={w.weekday} className="flex items-center gap-2.5">
                  <span className="w-9 shrink-0 text-[11.5px] font-semibold text-text-3 uppercase">
                    {w.label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-3">
                    <div
                      className={cn(
                        "h-full rounded-pill",
                        w.onTimePct === null
                          ? "bg-text-3/30"
                          : w.onTimePct >= 80
                            ? "bg-status-green"
                            : w.onTimePct >= 60
                              ? "bg-status-amber"
                              : "bg-status-red",
                      )}
                      style={{ width: `${(w.total / max) * 100}%` }}
                    />
                  </div>
                  <span className="num w-8 shrink-0 text-right text-[12px] text-text-3">
                    {w.total}
                  </span>
                  <span className="num w-11 shrink-0 text-right text-[12px] font-semibold text-text-2">
                    {w.onTimePct === null ? "—" : `${w.onTimePct}%`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="px-4 pb-3 text-[11.5px] leading-snug text-text-3">
            The bar is how much work falls on that day; the figure on the right
            is how much of it was on time. Sunday is always empty — nothing is
            ever scheduled on one.
          </p>
        </section>

        </div>
        {/* ── the heatmap ───────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                Daily
              </div>
              <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                Heatmap · click a day to open it
              </h3>
            </div>
          </div>

          {/* Shift the window a whole period at a time. Predictable in a way
              "previous month" is not when the range is 47 days long. */}
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border px-4 py-2.5">
            <button
              type="button"
              aria-label="Previous period"
              onClick={() =>
                setParam({
                  from: addDays(from, -data.period.days),
                  to: addDays(to, -data.period.days),
                })
              }
              className="grid size-8 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1"
            >
              <IconChevronLeft className="size-4" />
            </button>
            <Input
              type="date"
              aria-label="Heatmap from"
              className="num h-8 w-[142px]"
              value={from}
              max={to}
              onChange={(e) => setParam({ from: e.target.value || null })}
            />
            <IconArrowRight className="size-4 text-text-3" />
            <Input
              type="date"
              aria-label="Heatmap to"
              className="num h-8 w-[142px]"
              value={to}
              min={from}
              onChange={(e) => setParam({ to: e.target.value || null })}
            />
            <QuietButton
              onClick={() =>
                setParam({
                  from: startOfMonth(data.today),
                  to: endOfMonth(data.today),
                })
              }
            >
              <IconRotate className="size-3.5" />
              Reset
            </QuietButton>
            <button
              type="button"
              aria-label="Next period"
              onClick={() =>
                setParam({
                  from: addDays(from, data.period.days),
                  to: addDays(to, data.period.days),
                })
              }
              className="grid size-8 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1"
            >
              <IconChevronRight className="size-4" />
            </button>
            <span className="w-full text-center text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              {data.period.days} days · click any cell to open that day
            </span>
          </div>

          <div className="px-4 py-3.5">
            <Heatmap
              cells={data.days}
              today={data.today}
              onOpen={(d) =>
                router.push(
                  `/checklist/master?status=all&doer=${data.doer.id}&from=${d}&to=${d}`,
                )
              }
            />
          </div>

          {/* The full key. Six states, not five: "done, some late" and "all on
              time" are the distinction the whole chart exists to show, and a
              legend that merges them makes every amber square unexplained. */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[11px] text-text-3 sm:grid-cols-2 lg:grid-cols-3">
            <Key c="bg-status-green" label="On time — everything done by its day" />
            <Key c="bg-status-amber" label="Done late — all done, some after the day" />
            <Key c="bg-status-red" label="Overdue — the day passed, still not done" />
            <Key c="bg-status-blue" label="In progress — due today, not late yet" />
            <Key c="bg-surface-3" label="Scheduled — a future date, not due yet" />
            <Key c="bg-surface-2" label="Nothing due that day" />
          </div>
          <p className="border-t border-border px-4 py-2 text-[10.5px] tracking-[0.03em] text-text-3 uppercase">
            Each cell: day · done/planned · +avg days late · hover for the full
            breakdown
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── on-time · late · pending ──────────────────────────────── */}
        {/* Three states, not five. This one answers "of everything in the
            period, how much is finished and was it finished on time" — and
            PENDING is deliberately its own slice rather than being folded in
            with late, because work still to come is not a failure. */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              Composition
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              On time · late · pending
            </h3>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 px-4 py-4">
            <Donut
              size={150}
              centreLabel="Done"
              centreValue={
                k.total ? `${Math.round((k.done / k.total) * 100)}%` : "—"
              }
              centreSub={`of ${k.total}`}
              segments={[
                { label: "On time", value: k.onTime, className: "stroke-status-green" },
                { label: "Late", value: k.late, className: "stroke-status-red" },
                {
                  label: "Pending",
                  value: k.total - k.done,
                  className: "stroke-text-3/40",
                },
              ]}
            />
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <ScoreLegend label="On time" n={k.onTime} total={k.total} dot="bg-status-green" />
              <ScoreLegend label="Late" n={k.late} total={k.total} dot="bg-status-red" />
              <ScoreLegend
                label="Pending"
                n={k.total - k.done}
                total={k.total}
                dot="bg-text-3/45"
              />
            </div>
          </div>
        </section>
        {/* ── by frequency ──────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              By how often
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Completion breakdown
            </h3>
          </div>
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            {data.byFrequency.length === 0 ? (
              <p className="text-[12.5px] text-text-3">Nothing in this range.</p>
            ) : (
              data.byFrequency.map((f) => {
                const pct = (n: number) => (f.total ? (n / f.total) * 100 : 0);
                return (
                  <div key={f.frequency}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-text-1">
                        {FREQUENCY_META[f.frequency].label}
                      </span>
                      <span className="text-[11.5px] text-text-3">
                        {f.onTime} on time · {f.late} late · {f.open} open ·{" "}
                        {f.total} in all
                      </span>
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-pill bg-surface-3">
                      {f.onTime > 0 && (
                        <div className="bg-status-green" style={{ width: `${pct(f.onTime)}%` }} />
                      )}
                      {f.late > 0 && (
                        <div className="bg-status-red" style={{ width: `${pct(f.late)}%` }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TaskList
          eyebrow="Going well"
          title="Best three duties"
          rows={data.bestTasks}
          tone="green"
        />
        <TaskList
          eyebrow="Needs attention"
          title="Weakest three duties"
          rows={data.worstTasks}
          tone="red"
        />
      </div>

        {/* ── the busiest duties ────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              Volume
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Most frequent in this period
            </h3>
          </div>
          {data.topTasks.length === 0 ? (
            <p className="px-4 py-4 text-[12.5px] text-text-3">
              Nothing came round in this range.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {data.topTasks.map((t, i) => (
                <div key={t.taskId} className="flex items-center gap-3 px-4 py-2.5">
                  <RankBadge index={i} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-[11.5px] whitespace-nowrap text-text-3">
                    {t.count} times · {t.donePct}% done
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
    </div>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────

function Figure({
  icon,
  label,
  value,
  sub,
  delta,
  suffix,
  tone,
  lowerIsBetter,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  delta?: number;
  suffix?: string;
  tone?: "good" | "warn" | "bad";
  lowerIsBetter?: boolean;
}) {
  const improved = delta === undefined ? false : lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {icon && (
            <span className="grid size-6 shrink-0 place-items-center rounded-field bg-chip text-text-2">
              {icon}
            </span>
          )}
          <span className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
            {label}
          </span>
        </span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold",
              improved ? "text-status-green" : "text-status-red",
            )}
            title={`${delta > 0 ? "Up" : "Down"} ${Math.abs(Math.round(delta * 10) / 10)}${suffix ?? ""} on the period before this one`}
          >
            {delta > 0 ? (
              <IconArrowUpRight className="size-3" />
            ) : (
              <IconArrowDownRight className="size-3" />
            )}
            {Math.abs(Math.round(delta * 10) / 10)}
            {suffix ?? ""}
          </span>
        )}
        {delta === 0 && (
          <span className="inline-flex items-center text-[11px] text-text-3" title="Unchanged from the period before">
            <IconMinus className="size-3" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "num mt-1.5 text-[26px] leading-none font-bold tracking-[-0.02em]",
          tone === "good" && "text-status-green",
          tone === "warn" && "text-status-amber",
          tone === "bad" && "text-status-red",
          !tone && "text-text-1",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] leading-snug text-text-3">{sub}</div>
    </div>
  );
}

/**
 * The heatmap.
 *
 * Laid out as real weeks — seven columns, Monday to Sunday — rather than a
 * flat run of days, because the whole reason to look at this rather than a
 * list is to see a pattern: every Friday green, every Monday red. A flat
 * strip destroys exactly that.
 */
function Heatmap({
  cells,
  today,
  onOpen,
}: {
  cells: DayCell[];
  today: string;
  onOpen: (date: string) => void;
}) {
  if (cells.length === 0) return null;

  // Pad the first week so the first day lands in its real column. Monday-first,
  // which is how a working week reads here.
  const lead = (weekdayOf(cells[0].date) + 6) % 7;
  const slots: (DayCell | null)[] = [...Array(lead).fill(null), ...cells];
  while (slots.length % 7 !== 0) slots.push(null);

  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  // ── THE CELLS ARE WIDE, NOT SQUARE ─────────────────────────────────────
  //
  // Two earlier attempts were both wrong. `aspect-square` across a full-width
  // card gave ninety-pixel tiles — a wall of colour that hid the pattern the
  // chart exists to show. Capping the whole grid at 380px fixed the tiles and
  // created a new problem: a small calendar marooned in the middle of a wide
  // card with empty space either side, which is what the owner reported.
  //
  // The answer is the one their own system uses: let the grid FILL the card
  // and fix the ROW HEIGHT instead. Cells come out wide and short, the card
  // has no dead margins, and a two-month range still fits on one screen.
  return (
    <div className="w-full">
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
        {weeks.map((w, i) => (
          <div key={i} className="grid grid-cols-7 gap-1.5">
            {w.map((c, j) =>
              c === null ? (
                <div key={j} className="h-14 rounded-md" />
              ) : (
                <button
                  key={j}
                  type="button"
                  disabled={c.total === 0}
                  onClick={() => onOpen(c.date)}
                  title={cellTitle(c, today)}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center rounded-md text-[12px] leading-none font-bold transition-opacity",
                    cellColour(c, today),
                    c.total > 0
                      ? "cursor-pointer hover:opacity-80"
                      : "cursor-default",
                    c.date === today &&
                      "ring-2 ring-primary ring-offset-1 ring-offset-[var(--surface)]",
                  )}
                >
                  <span>{Number(c.date.slice(8, 10))}</span>
                  {c.total > 0 && (
                    <span className="mt-1 text-[10px] font-medium opacity-85">
                      {c.done}/{c.total}
                    </span>
                  )}
                  {/* The one number that says HOW late, not just that it was.
                      A day showing 5/5 in amber is finished; +3d is the fact
                      worth acting on. */}
                  {c.avgDelay > 0 && (
                    <span className="mt-0.5 text-[9.5px] font-bold opacity-95">
                      +{c.avgDelay}d
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function cellColour(c: DayCell, today: string): string {
  if (c.total === 0) return "bg-surface-2 text-text-3";
  if (c.overdue > 0) return "bg-status-red text-white";
  if (c.done === c.total) {
    return c.late > 0
      ? "bg-status-amber text-white"
      : "bg-status-green text-white";
  }
  if (c.date <= today) return "bg-status-blue text-white";
  return "bg-surface-3 text-text-2";
}

function cellTitle(c: DayCell, today: string): string {
  if (c.total === 0) return `${formatDate(c.date)} — nothing due`;
  const bits = [`${formatDate(c.date)} — ${c.done} of ${c.total} done`];
  if (c.onTime) bits.push(`${c.onTime} on time`);
  if (c.late) bits.push(`${c.late} late by ${c.avgDelay}d on average`);
  if (c.overdue) bits.push(`${c.overdue} still open`);
  if (c.date > today) bits.push("not due yet");
  return bits.join(" · ");
}

function TaskList({
  eyebrow,
  title,
  rows,
  tone,
}: {
  eyebrow: string;
  title: string;
  rows: { taskId: number; name: string; count: number; onTimePct: number }[];
  tone: "green" | "red";
}) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div
          className={cn(
            "text-[11px] font-semibold tracking-[0.06em] uppercase",
            tone === "green" ? "text-status-green" : "text-status-red",
          )}
        >
          {eyebrow}
        </div>
        <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] leading-relaxed text-text-3">
          Nothing has come round often enough to rank yet. A duty needs at least
          three occurrences in this period before it is called somebody&rsquo;s
          best or worst — one miss is not a pattern.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {rows.map((t, i) => (
            <div key={t.taskId} className="flex items-center gap-3 px-4 py-2.5">
              <RankBadge index={i} tone={tone === "green" ? "good" : "bad"} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">
                {t.name}
              </span>
              <span className="shrink-0 text-[11.5px] whitespace-nowrap text-text-3">
                {t.count} times ·{" "}
                <strong
                  className={cn(
                    "font-bold",
                    tone === "green" ? "text-status-green" : "text-status-red",
                  )}
                >
                  {t.onTimePct}%
                </strong>{" "}
                on time
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** One line of the composition key. */
function ScoreLegend({
  label,
  n,
  total,
  dot,
}: {
  label: string;
  n: number;
  total: number;
  dot: string;
}) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-sm", dot)} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-2">{label}</span>
      <span className="num shrink-0 text-[12.5px] font-bold text-text-1">{n}</span>
      <span className="num w-8 shrink-0 text-right text-[11.5px] text-text-3">{pct}%</span>
    </div>
  );
}

function Key({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-sm", c)} />
      {label}
    </span>
  );
}

/**
 * The quick ranges, all six the original offers.
 *
 * "Year to date" runs from the start of the FINANCIAL year, not the calendar
 * one. Theirs uses 1 January because that is what `new Date(y,0,1)` gives; for
 * a business whose year runs April to March, a figure "for the year" that
 * silently means January onwards is wrong for nine months out of twelve. The
 * tooltip says which year it means, so nobody has to guess.
 */
function QUICK_RANGES(today: string) {
  const lastMonthAnchor = addMonths(today, -1);
  const fy = financialYearOf(today);
  return [
    { label: "Last 30 days", from: addDays(today, -29), to: today, hint: "The last 30 days up to today" },
    { label: "Last 60 days", from: addDays(today, -59), to: today, hint: "The last 60 days up to today" },
    { label: "Last 90 days", from: addDays(today, -89), to: today, hint: "The last 90 days up to today" },
    {
      label: "This month",
      from: startOfMonth(today),
      to: endOfMonth(today),
      hint: "The calendar month you are in",
    },
    {
      label: "Last month",
      from: startOfMonth(lastMonthAnchor),
      to: endOfMonth(lastMonthAnchor),
      hint: "The whole of the previous calendar month",
    },
    {
      label: "Year to date",
      from: fy.from,
      to: today,
      hint: `Financial year ${fy.label} so far — from ${formatDate(fy.from)}, not from January`,
    },
  ];
}

function lastSixMonths(today: string): string[] {
  const out: string[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
