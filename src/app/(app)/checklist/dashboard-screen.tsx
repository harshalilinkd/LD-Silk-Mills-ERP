"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarEvent,
  IconChecklist,
  IconCircleCheck,
  IconClockHour4,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

// From `figures`, NOT from `dashboard-query`. That module is `server-only`,
// and a client component importing one fails the entire build, not just
// itself — this repo has already lost an unrelated page to that exact mistake.
import { completionRate, onTimeRate, type Dashboard } from "@/lib/checklist/figures";
import { formatDateLong } from "@/lib/checklist/dates";
import { cn } from "@/lib/utils";
import { useChecklistViewer } from "./viewer-context";
import {
  EmptyState,
  Input,
  PageHead,
  Select,
  TableCard,
} from "./parts";

/**
 * The dashboard.
 *
 * ── EVERY FIGURE CARRIES ITS DENOMINATOR ─────────────────────────────────
 *
 * "78%" is not a fact until you know 78% of what. Each card here prints the
 * rule underneath it — "of the ones that have been done", "of the ones that
 * have come round" — because these numbers describe people's work and get
 * quoted in conversations about it. The rules themselves are in
 * `lib/checklist/dashboard-query.ts`; this only renders them.
 *
 * A figure that CANNOT be computed says so rather than showing 0%. Nothing
 * done yet is not the same as nothing done on time, and a big red 0% on a
 * fresh month would be a lie the screen told first.
 */
export function DashboardScreen({
  data,
  people,
  departments,
}: {
  data: Dashboard | null;
  people: { id: number; name: string; department: string | null }[];
  departments: string[];
}) {
  const viewer = useChecklistViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [showAllDoers, setShowAllDoers] = React.useState(false);

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
        <PageHead eyebrow="Overview" title="Checklist" />
        <TableCard
          empty={
            <EmptyState
              icon={<IconChecklist className="size-5" />}
              title="You are not on the doers list yet"
              body="Nothing has been assigned to you, so there is nothing to measure. An administrator adds people on the Doers screen."
            />
          }
        />
      </div>
    );
  }

  const t = data.totals;
  const onTime = onTimeRate(t);
  const completion = completionRate(t);
  const activeFilters = ["doer", "dept", "from", "to"].filter((k) => params.get(k)).length;

  if (t.total === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead
          eyebrow="Overview"
          title="Checklist"
          lede={`Today is ${formatDateLong(data.today)}.`}
        />
        <TableCard
          empty={
            <EmptyState
              icon={<IconChecklist className="size-5" />}
              title={activeFilters > 0 ? "Nothing in that range" : "Nothing scheduled yet"}
              body={
                activeFilters > 0
                  ? "Widen the dates or clear the filters."
                  : viewer.isAdmin
                    ? "Add the people on the Doers screen, then the duties on Tasks. The dates fill in on their own from there."
                    : "Nothing has been assigned to you yet."
              }
              action={
                viewer.isAdmin && activeFilters === 0 ? (
                  <Link
                    href="/checklist/doers"
                    className="inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
                  >
                    Start with the Doers list
                    <IconArrowRight className="size-4" />
                  </Link>
                ) : undefined
              }
            />
          }
        />
      </div>
    );
  }

  const openWork = t.delayed + t.dueToday + t.upcoming + t.scheduled;

  const CARDS = [
    {
      icon: <IconCircleCheck className="size-4" />,
      label: "On time",
      value: onTime === null ? "—" : `${onTime}%`,
      sub:
        onTime === null
          ? "Nothing has been ticked off yet"
          : `Of the ${t.done.toLocaleString("en-IN")} ticked off, ${t.onTime.toLocaleString("en-IN")} on or before the day`,
      tone: onTime === null ? "grey" : onTime >= 80 ? "green" : onTime >= 60 ? "amber" : "red",
    },
    {
      icon: <IconTrendingUp className="size-4" />,
      label: "Completed",
      value: completion === null ? "—" : `${completion}%`,
      sub:
        completion === null
          ? "Nothing has come round yet"
          : `Of the ${(t.done + t.delayed + t.dueToday).toLocaleString("en-IN")} that have come round. Future dates are not counted`,
      tone: completion === null ? "grey" : completion >= 80 ? "green" : completion >= 60 ? "amber" : "red",
    },
    {
      icon: <IconAlertTriangle className="size-4" />,
      label: "Delayed",
      value: t.delayed.toLocaleString("en-IN"),
      sub: "Their day has passed and they are still not done",
      tone: t.delayed > 0 ? "red" : "green",
      href: "/checklist/master?status=Delayed",
    },
    {
      icon: <IconClockHour4 className="size-4" />,
      label: "Average delay",
      value: t.avgDelay > 0 ? `${t.avgDelay}d` : "—",
      sub:
        t.avgDelay > 0
          ? "Days late, counting only the ones finished late"
          : "Nothing has been finished late",
      tone: t.avgDelay >= 3 ? "red" : t.avgDelay > 0 ? "amber" : "green",
    },
    {
      icon: <IconUsers className="size-4" />,
      label: viewer.isAdmin ? "People with work" : "Your open work",
      value: viewer.isAdmin
        ? t.activeDoers.toLocaleString("en-IN")
        : openWork.toLocaleString("en-IN"),
      sub: viewer.isAdmin
        ? "Have at least one thing still open"
        : "Still to be done",
      tone: "grey",
    },
    {
      icon: <IconCalendarEvent className="size-4" />,
      label: "Due today",
      value: t.dueToday.toLocaleString("en-IN"),
      sub: formatDateLong(data.today),
      tone: t.dueToday > 0 ? "blue" : "grey",
      href: "/checklist/master?status=Today",
    },
  ] as const;

  const shownDoers = showAllDoers ? data.worstDoers : data.worstDoers.slice(0, 5);
  const maxDelayed = data.worstDoers[0]?.delayed ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Overview"
        title="Checklist"
        lede={
          viewer.isAdmin
            ? `Everybody's recurring duties. Today is ${formatDateLong(data.today)}.`
            : `Your recurring duties. Today is ${formatDateLong(data.today)}.`
        }
      />

      {/* ── one compact row, the shape Order Entry's dashboard uses ──── */}
      {/* No captions: four controls whose own text says what they are
          ("All doers", "All departments", a date) do not need a label above
          each one, and the labels were costing a whole extra line of height
          before any figure appeared. The panel pattern with captions is for
          screens where the filters fold away; this bar is always on. */}
      <div className="flex flex-wrap items-center gap-2 rounded-field border border-border bg-surface p-2.5">
        {viewer.isAdmin && (
          <>
            <Select
              aria-label="Doer"
              className="w-auto min-w-[150px] flex-1 sm:flex-none"
              value={params.get("doer") ?? ""}
              onChange={(e) => setParam({ doer: e.target.value || null })}
            >
              <option value="">All doers</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Department"
              className="w-auto min-w-[150px] flex-1 sm:flex-none"
              value={params.get("dept") ?? ""}
              onChange={(e) => setParam({ dept: e.target.value || null })}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <Input
            type="date"
            aria-label="From date"
            className="num min-w-0 flex-1 sm:w-[150px] sm:flex-none"
            value={params.get("from") ?? ""}
            max={params.get("to") || undefined}
            onChange={(e) => setParam({ from: e.target.value || null })}
          />
          <span className="text-text-3">–</span>
          <Input
            type="date"
            aria-label="To date"
            className="num min-w-0 flex-1 sm:w-[150px] sm:flex-none"
            value={params.get("to") ?? ""}
            min={params.get("from") || undefined}
            onChange={(e) => setParam({ to: e.target.value || null })}
          />
        </div>

        <span className="ml-auto text-[12px] whitespace-nowrap text-text-3">
          <strong className="num font-semibold text-text-2">
            {t.total.toLocaleString("en-IN")}
          </strong>{" "}
          rows
        </span>
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="cursor-pointer rounded-field px-2 py-1 text-[12px] font-medium text-text-2 transition-colors hover:bg-chip hover:text-text-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── the six figures ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((c) => {
          const body = (
            <>
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-field",
                  c.tone === "green" && "bg-status-green-dim text-status-green",
                  c.tone === "red" && "bg-status-red-dim text-status-red",
                  c.tone === "amber" && "bg-status-amber-dim text-status-amber",
                  c.tone === "blue" && "bg-status-blue-dim text-status-blue",
                  c.tone === "grey" && "bg-chip text-text-2",
                )}
              >
                {c.icon}
              </span>
              <div
                className={cn(
                  "num mt-2 text-[26px] leading-none font-bold tracking-[-0.02em]",
                  c.tone === "red" ? "text-status-red" : "text-text-1",
                )}
              >
                {c.value}
              </div>
              <div className="mt-1.5 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
                {c.label}
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-text-3">
                {c.sub}
              </div>
            </>
          );
          return "href" in c && c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-card border border-border bg-surface p-3.5 transition-colors hover:bg-surface-2"
            >
              {body}
            </Link>
          ) : (
            <div
              key={c.label}
              className="rounded-card border border-border bg-surface p-3.5"
            >
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ── by department ─────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
                By department
              </div>
              <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                Where the work stands
              </h2>
            </div>
            <span className="num text-[13px] font-bold text-text-2">
              {data.departments.length}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-[11.5px] text-text-3">
            <Key colour="bg-status-green" label="Done" />
            <Key colour="bg-status-blue" label="Today" />
            <Key colour="bg-status-amber" label="Due soon" />
            <Key colour="bg-status-red" label="Delayed" />
            <Key colour="bg-text-3/45" label="Later" />
          </div>

          <div className="flex flex-col divide-y divide-border px-4 py-2">
            {data.departments.map((d, i) => {
              const later = d.total - d.done - d.dueToday - d.upcoming - d.delayed;
              const pct = (n: number) => (d.total ? (n / d.total) * 100 : 0);
              const donePct = d.total ? Math.round((d.done / d.total) * 100) : 0;
              return (
                <div key={d.department} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="num text-[11px] font-bold text-text-3">
                        #{i + 1}
                      </span>
                      <span className="truncate text-[13px] font-semibold text-text-1">
                        {d.department}
                      </span>
                      <span className="text-[11.5px] whitespace-nowrap text-text-3">
                        {d.total.toLocaleString("en-IN")} rows
                      </span>
                    </div>
                    <span
                      className={cn(
                        "num text-[13px] font-bold",
                        donePct >= 80
                          ? "text-status-green"
                          : donePct >= 60
                            ? "text-status-amber"
                            : "text-status-red",
                      )}
                      title="Share of this department's rows that are ticked off"
                    >
                      {donePct}% done
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-pill bg-surface-3">
                    <Seg w={pct(d.done)} c="bg-status-green" />
                    <Seg w={pct(d.dueToday)} c="bg-status-blue" />
                    <Seg w={pct(d.upcoming)} c="bg-status-amber" />
                    <Seg w={pct(d.delayed)} c="bg-status-red" />
                    <Seg w={pct(later)} c="bg-text-3/45" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── the split ─────────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
              Status breakdown
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              All {t.total.toLocaleString("en-IN")} rows in view
            </h2>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <Bar label="Done" n={t.done} total={t.total} colour="bg-status-green" text="text-status-green" />
            <Bar label="Delayed" n={t.delayed} total={t.total} colour="bg-status-red" text="text-status-red" />
            <Bar label="Due today" n={t.dueToday} total={t.total} colour="bg-status-blue" text="text-status-blue" />
            <Bar label="Due within a week" n={t.upcoming} total={t.total} colour="bg-status-amber" text="text-status-amber" />
            <Bar label="Later" n={t.scheduled} total={t.total} colour="bg-text-3/45" text="text-text-2" />
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border px-4 py-3">
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                Finished
              </div>
              <div className="num mt-0.5 text-[19px] font-bold text-status-green">
                {t.done.toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                Still open
              </div>
              <div className="num mt-0.5 text-[19px] font-bold text-status-red">
                {openWork.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── who is behind ───────────────────────────────────────────── */}
      {viewer.isAdmin && data.worstDoers.length > 0 && (
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
                Needs attention
              </div>
              <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
                Most delayed work
              </h2>
            </div>
            {data.worstDoers.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllDoers((v) => !v)}
                className="cursor-pointer text-[12px] font-medium text-text-2 hover:text-text-1"
              >
                {showAllDoers
                  ? "Show top 5"
                  : `Show all ${data.worstDoers.length}`}
              </button>
            )}
          </div>
          <div className="flex flex-col divide-y divide-border">
            {shownDoers.map((d) => (
              <Link
                key={d.doerId}
                href={`/checklist/master?status=Delayed&doer=${d.doerId}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-text">
                  {initials(d.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-text-1">
                    {d.name}
                  </div>
                  <div className="text-[11.5px] text-text-3">
                    {d.department || "No department"}
                  </div>
                </div>
                <div className="hidden h-1.5 w-40 overflow-hidden rounded-pill bg-surface-3 sm:block">
                  <div
                    className="h-full rounded-pill bg-status-red"
                    style={{ width: `${(d.delayed / maxDelayed) * 100}%` }}
                  />
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-[17px] leading-none font-bold text-status-red">
                    {d.delayed}
                  </div>
                  <div className="text-[10px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                    delayed
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Seg({ w, c }: { w: number; c: string }) {
  if (w <= 0) return null;
  return <div className={c} style={{ width: `${w}%` }} />;
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-sm", colour)} />
      {label}
    </span>
  );
}

function Bar({
  label,
  n,
  total,
  colour,
  text,
}: {
  label: string;
  n: number;
  total: number;
  colour: string;
  text: string;
}) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-text-2">{label}</span>
        <span className="num text-[12.5px] whitespace-nowrap">
          <strong className={cn("font-bold", text)}>{n.toLocaleString("en-IN")}</strong>
          <span className="ml-1.5 text-text-3">{pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-3">
        <div className={cn("h-full rounded-pill", colour)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
