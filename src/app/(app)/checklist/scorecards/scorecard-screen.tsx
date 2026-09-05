"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconDownload,
  IconMinus,
  IconPrinter,
  IconUserQuestion,
} from "@tabler/icons-react";

import {
  addDays,
  endOfMonth,
  formatDate,
  monthLabel,
  startOfMonth,
  weekdayOf,
} from "@/lib/checklist/dates";
import { FREQUENCY_META } from "@/lib/checklist/frequency";
import type { DayCell, Scorecard } from "@/lib/checklist/scorecard-query";
import { cn } from "@/lib/utils";
import { useChecklistViewer } from "../viewer-context";
import {
  EmptyState,
  Field,
  Input,
  PageHead,
  QuietButton,
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

      {/* ── who and when ────────────────────────────────────────────── */}
      <div className="rounded-card border border-border bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {viewer.isAdmin && (
            <Field label="Doer">
              <Select
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
            </Field>
          )}
          <Field label="Month">
            <Select
              value={
                from === startOfMonth(from) && to === endOfMonth(from) ? from : ""
              }
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
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={from}
              onChange={(e) => setParam({ from: e.target.value || null })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={to}
              onChange={(e) => setParam({ to: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
          <span className="mr-1 text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase">
            Quick
          </span>
          {[
            { label: "Last 30 days", days: 30 },
            { label: "Last 60 days", days: 60 },
            { label: "Last 90 days", days: 90 },
          ].map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() =>
                setParam({ from: addDays(data.today, -(r.days - 1)), to: data.today })
              }
              className="cursor-pointer rounded-field border border-border bg-surface px-2 py-1 text-[12px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setParam({ from: startOfMonth(data.today), to: endOfMonth(data.today) })
            }
            className="cursor-pointer rounded-field border border-border bg-surface px-2 py-1 text-[12px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
          >
            This month
          </button>
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

        <div className="flex items-center gap-4 rounded-card border border-border bg-surface-2 px-4 py-3">
          <div className="text-center">
            <div className="text-[10px] font-bold tracking-[0.06em] text-text-3 uppercase">
              Score
            </div>
            <div
              className={cn(
                "num text-[30px] leading-none font-bold tracking-[-0.02em]",
                k.reliability === null
                  ? "text-text-3"
                  : k.reliability >= 75
                    ? "text-status-green"
                    : k.reliability >= 50
                      ? "text-status-amber"
                      : "text-status-red",
              )}
            >
              {k.reliability ?? "—"}
            </div>
            <div className="text-[10.5px] text-text-3">out of 100</div>
          </div>
          <div className="flex flex-col gap-1 border-l border-border pl-4">
            <Part label="On time" weight="50%" pct={k.onTimePct} />
            <Part label="Got done" weight="30%" pct={k.completionPct} />
            <Part
              label="Best run"
              weight="20%"
              pct={Math.min(100, Math.round((k.bestStreak / 30) * 100))}
            />
          </div>
        </div>
      </section>

      {/* ── the five figures ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Figure
          label="Scheduled"
          value={k.total.toLocaleString("en-IN")}
          sub={`${k.due.toLocaleString("en-IN")} have come round so far`}
        />
        <Figure
          label="Ticked off"
          value={k.done.toLocaleString("en-IN")}
          sub={`${k.onTime} on time, ${k.late} late`}
          delta={k.done - prev.done}
        />
        <Figure
          label="On time"
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
          label="Average delay"
          value={k.avgDelay > 0 ? `${k.avgDelay}d` : "—"}
          sub={k.late > 0 ? `Over the ${k.late} finished late` : "Nothing finished late"}
          delta={prev.avgDelay > 0 || k.avgDelay > 0 ? k.avgDelay - prev.avgDelay : undefined}
          suffix="d"
          lowerIsBetter
        />
        <Figure
          label="Best run"
          value={String(k.bestStreak)}
          sub={`In a row, on time · ${k.currentStreak} running now`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* ── six-month trend ───────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
              Trend
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              On time, last six months
            </h3>
          </div>
          <div className="flex items-end gap-2 px-4 pt-4">
            {data.trend.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[11.5px] font-bold text-text-2">
                  {m.onTimePct === null ? "—" : `${m.onTimePct}%`}
                </span>
                <div className="flex h-24 w-full items-end">
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

        {/* ── the heatmap ───────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
                Day by day
              </div>
              <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                {data.period.days} days
              </h3>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-3">
              <Key c="bg-status-green" label="All on time" />
              <Key c="bg-status-amber" label="Some late" />
              <Key c="bg-status-red" label="Still open, day passed" />
              <Key c="bg-status-blue" label="Open, not late yet" />
              <Key c="bg-surface-3" label="Nothing due" />
            </div>
          </div>
          <div className="overflow-x-auto px-4 py-3.5">
            <Heatmap cells={data.days} today={data.today} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── weekday pattern ───────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
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

        {/* ── by frequency ──────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
              By how often
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Daily duties versus the rest
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

      {data.topTasks.length > 0 && (
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
              Volume
            </div>
            <h3 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Most frequent duties in this period
            </h3>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {data.topTasks.map((t, i) => (
              <div key={t.taskId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="num w-6 shrink-0 text-[11px] font-bold text-text-3">
                  #{i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">
                  {t.name}
                </span>
                <span className="shrink-0 text-[11.5px] whitespace-nowrap text-text-3">
                  {t.count} times · {t.donePct}% done
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────

function Part({
  label,
  weight,
  pct,
}: {
  label: string;
  weight: string;
  pct: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] whitespace-nowrap">
      <span className="w-14 text-text-3">{label}</span>
      <span className="w-7 text-text-3">{weight}</span>
      <span className="h-1 w-14 overflow-hidden rounded-pill bg-surface-3">
        <span
          className="block h-full rounded-pill bg-primary"
          style={{ width: `${pct ?? 0}%` }}
        />
      </span>
      <span className="num w-8 text-right font-semibold text-text-2">
        {pct === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

/**
 * A figure, with how it moved since the period before.
 *
 * ── THE ARROW FOLLOWS THE NUMBER; THE COLOUR FOLLOWS THE MEANING ─────────
 *
 * An earlier version negated the delta for average delay so that an
 * improvement came out positive and green. It coloured correctly and pointed
 * the wrong way: a delay that had risen from 0 to 29 days showed a DOWN arrow,
 * which reads as "the delay fell by 29 days" — the opposite of the truth.
 *
 * So the two are separated. The arrow always points the way the value actually
 * moved, and `lowerIsBetter` decides only whether that movement is coloured as
 * good or bad. For most figures up is good; for a delay it is not.
 */
function Figure({
  label,
  value,
  sub,
  delta,
  suffix,
  tone,
  lowerIsBetter,
}: {
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
        <span className="text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
          {label}
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
function Heatmap({ cells, today }: { cells: DayCell[]; today: string }) {
  if (cells.length === 0) return null;

  // Pad the first week so the first day lands in its real column. Monday-first,
  // which is how a working week reads here.
  const lead = (weekdayOf(cells[0].date) + 6) % 7;
  const slots: (DayCell | null)[] = [...Array(lead).fill(null), ...cells];
  while (slots.length % 7 !== 0) slots.push(null);

  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  // Capped, not stretched. `aspect-square` across a full-width card gives
  // ninety-pixel tiles for a two-month range — a wall of coloured boxes that
  // hides the pattern it exists to show. A calendar reads best at about the
  // size of a calendar.
  return (
    <div className="w-full max-w-[380px] min-w-[300px]">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold tracking-[0.04em] text-text-3 uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {weeks.map((w, i) => (
          <div key={i} className="grid grid-cols-7 gap-1">
            {w.map((c, j) =>
              c === null ? (
                <div key={j} className="aspect-square rounded-sm" />
              ) : (
                <div
                  key={j}
                  title={cellTitle(c, today)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-sm text-[10px] leading-none font-semibold",
                    cellColour(c, today),
                    c.date === today && "ring-2 ring-primary ring-offset-1 ring-offset-[var(--surface)]",
                  )}
                >
                  <span>{Number(c.date.slice(8, 10))}</span>
                  {c.total > 0 && (
                    <span className="mt-0.5 text-[8.5px] font-normal opacity-80">
                      {c.done}/{c.total}
                    </span>
                  )}
                </div>
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
            "text-[10.5px] font-semibold tracking-[0.08em] uppercase",
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
              <span className="num w-6 shrink-0 text-[11px] font-bold text-text-3">
                #{i + 1}
              </span>
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

function Key({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-sm", c)} />
      {label}
    </span>
  );
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
