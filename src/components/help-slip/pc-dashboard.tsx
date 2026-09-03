"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBuildingFactory2,
  IconChartLine,
  IconCircleCheck,
  IconClock,
  IconGauge,
  IconInbox,
  IconLoader2,
  IconMoodSmile,
  IconPlayerPause,
  IconSearch,
  IconTargetArrow,
} from "@tabler/icons-react";

import {
  OverdueBadge,
  PriorityChip,
  StatusBadge,
} from "@/components/help-slip/badges";
import { BarList, TrendChart } from "@/components/help-slip/charts";
import {
  DateRangeFields,
  FILTER_TOOLBAR,
  FilterSelect,
  departmentOptions,
  priorityOptions,
} from "@/components/help-slip/filters";
import { KpiStrip, type Kpi } from "@/components/help-slip/kpi-strip";
import {
  CountChip,
  ListState,
  LoadMore,
  PageHeader,
  Panel,
  PanelHead,
  SectionCard,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import type { ConcernPriority } from "@/db/help-slip/schema";
import { helpSlipGet } from "@/lib/help-slip/api-client";
import {
  absoluteTime,
  dayKey,
  dayKeyMinus,
  dayLabel,
  departmentOf,
  relativeTime,
  shortAge,
  startOfMonthKey,
} from "@/lib/help-slip/format";
import { useDebouncedValue } from "@/lib/help-slip/use-debounced-value";
import { HELP_SLIP_STALE_TIME } from "@/lib/help-slip/use-unread-count";
import {
  activeQueueFilterCount,
  hasQueueFilter,
  parseDateParam,
  parsePriorityParam,
  parseQueueBucket,
  type Insights,
  type QueueBucket,
  type QueueFilters,
  type QueuePayload,
  type QueueRow,
} from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The coordinator's dashboard.
 *
 * It answers ONE question with zero clicks: what needs me now? Everything here
 * serves that and nothing else.
 *
 *  - The default sort is overdue, then priority, then age, applied on every
 *    request (see `loadQueue`). Urgency surfaces itself — a coordinator who
 *    has to configure a sort to find the right row will not do it at 7am, and
 *    the row they miss is the one that was already late.
 *  - The default filter excludes resolved and closed, because a queue of
 *    finished work is not a queue.
 *  - Overdue rows get a 3px left border and a badge, NEVER a red fill. Nine
 *    rows with three red backgrounds reads as a system on fire, which is the
 *    opposite of useful when three of nine are late; a rule at the edge reads
 *    as three rows that need you.
 *
 * ── TWO WINDOWS ON ONE SCREEN ─────────────────────────────────────────────
 * The KPI cells and the queue table show current STATE. The insights panels
 * below show a date RANGE. They are different questions, so the date picker
 * moves the charts and leaves the counts alone — and the counts, being state,
 * would be wrong if it did not.
 *
 * ── THE SHAPE OF THE PAGE ─────────────────────────────────────────────────
 * Four regions, each a bordered card or a grid of them, 20px apart, exactly
 * as `order-entry/dashboard/dashboard-view.tsx` lays out the same job: filter
 * bar → KPI grid → panels → the list. Nothing on this screen sits on the page
 * ground; the ground is only ever visible BETWEEN cards.
 *
 * ── WHAT IS DELIBERATELY MISSING ──────────────────────────────────────────
 * The source's per-row quick actions (Start, Assign to me, and the phone's
 * "…" sheet) are WRITES. This phase is read screens; a Start button that
 * silently does nothing is worse than no Start button.
 */
export function PcDashboard() {
  const router = useRouter();
  const params = useSearchParams();

  const filters = React.useMemo(() => filtersFromParams(params), [params]);
  const today = dayKey(new Date());
  const range = React.useMemo(
    () => ({
      from: parseDateParam(params.get("from")) ?? dayKeyMinus(29),
      to: parseDateParam(params.get("to")) ?? today,
    }),
    [params, today],
  );

  const write = React.useCallback(
    (next: QueueFilters, nextRange: { from: string; to: string }) => {
      router.replace(`/help-slip?${toParams(next, nextRange, today)}`, {
        scroll: false,
      });
    },
    [router, today],
  );

  const apply = (next: QueueFilters) => write(next, range);
  const setRange = (from: string, to: string) => write(filters, { from, to });

  const qs = toParams(filters, range, today);

  const q = useInfiniteQuery({
    queryKey: ["help-slip", "queue", qs],
    queryFn: ({ pageParam }) =>
      helpSlipGet<QueuePayload>(`/api/help-slip/queue?${qs}&page=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
    // Dimmed, not blanked, while a filter change is in flight. Replacing the
    // queue with a skeleton on every dropdown reads as breakage.
    placeholderData: (prev) => prev,
  });

  // The aggregates live on page 0 only — see QueuePayload. Reading them from
  // anywhere else would mean each "Load more" re-ran a 30-day aggregate.
  const first = q.data?.pages[0];
  const rows = React.useMemo(
    () => q.data?.pages.flatMap((p) => p.rows) ?? [],
    [q.data],
  );
  const counts = first?.counts;
  const total = first?.total ?? 0;
  const filtered = hasQueueFilter(filters);
  const debouncedRange = useDebouncedValue(range, 300);

  /**
   * Five cells, and each one is a filter that narrows the queue IN PLACE.
   *
   * NO sparklines here, deliberately. The counts come from a server aggregate
   * over current status, not from a set of rows this screen holds, so there is
   * nothing honest to plot without a second query per card. The insights
   * panels' own filed/resolved series was tried in the source and reverted: it
   * is real data, but it answers "how many were filed that day", not "how many
   * are in New right now", and the two numbers do not agree. A line that does
   * not end at its own card's number is worse than no line at all.
   */
  const kpis: Kpi[] = [
    {
      key: "new",
      labelEn: "New",
      value: counts?.new ?? 0,
      icon: IconInbox,
      tone: "violet",
    },
    {
      key: "in_progress",
      labelEn: "In Progress",
      value: counts?.in_progress ?? 0,
      icon: IconLoader2,
      tone: "amber",
    },
    {
      key: "waiting",
      labelEn: "Waiting",
      value: counts?.waiting ?? 0,
      icon: IconPlayerPause,
      tone: "blue",
    },
    {
      key: "resolved",
      labelEn: "Resolved",
      value: counts?.resolved ?? 0,
      icon: IconCircleCheck,
      tone: "green",
    },
    {
      key: "overdue",
      labelEn: "Overdue",
      value: counts?.overdue ?? 0,
      icon: IconAlertTriangle,
      emphasis: "overdue",
    },
  ];

  const clearAll = () =>
    write(
      {
        bucket: "open",
        departmentId: null,
        priority: [],
        needsReassignment: false,
      },
      range,
    );

  return (
    // The ERP page root, verbatim: `flex flex-col gap-5`. `PageHeader` carries
    // no padding of its own, so this gap is the only thing spacing the title
    // off the first card — and it is the same 20px seam Order Entry puts
    // between every pair of regions.
    <div className="flex flex-col gap-5 pb-6">
      <Reveal index={0}>
        <PageHeader
          titleEn="Dashboard"
          subtitle="What needs you now."
          meta={total > 0 ? `Showing ${rows.length} of ${total}` : null}
        />
      </Reveal>

      {/* ═══ 1. filters ═════════════════════════════════════════════ *
       * The ERP toolbar CARD (filters.tsx's FILTER_TOOLBAR, verbatim from
       * crm/followup-queue.tsx): p-2.5 and shadow-sm, because a filter row is
       * controls, not prose. A bare row of controls beside carded content is
       * the loudest "floating on the page background" tell there is — and
       * `ListFallback` already draws a carded toolbar skeleton, so a bare row
       * would also mean the page changed shape when the data landed.        */}
      <Reveal index={1}>
        <div className={FILTER_TOOLBAR}>
          <FilterSelect
            ariaLabel="Department"
            value={filters.departmentId ?? ""}
            onChange={(v) => apply({ ...filters, departmentId: v || null })}
            options={departmentOptions(
              first?.departments ?? [],
              "All departments",
            )}
          />
          <FilterSelect
            ariaLabel="Priority"
            value={filters.priority[0] ?? ""}
            onChange={(v) =>
              apply({
                ...filters,
                priority: v ? [v as ConcernPriority] : [],
              })
            }
            options={priorityOptions("All priorities")}
          />

          {/* 44px tap row below md: the minimum touch target for a phone
              held on the factory floor. ERP density (36px) from md up. */}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 md:min-h-9">
            <input
              type="checkbox"
              checked={filters.needsReassignment}
              onChange={(e) =>
                apply({ ...filters, needsReassignment: e.target.checked })
              }
              className="size-[17px] shrink-0 cursor-pointer rounded-[5px] accent-primary"
            />
            <span className={cn("text-text-2", T.body)}>
              Needs reassignment
            </span>
          </label>

          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

          <DateRangePresets
            from={range.from}
            to={range.to}
            today={today}
            onChange={setRange}
          />

          {filtered || activeQueueFilterCount(filters) > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              // Hard right, as the ERP's filter well puts its Clear. A text
              // button is still an interactive control: 44px below md, the
              // ERP's 36px from md up.
              className={cn(
                "ml-auto inline-flex h-11 shrink-0 cursor-pointer items-center text-accent-text underline underline-offset-2 md:h-9",
                T.bodySm,
              )}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </Reveal>

      {/* ═══ 2. the five cells, each a filter ═══════════════════════ */}
      <Reveal index={2}>
        <KpiStrip
          items={kpis}
          loading={q.isPending}
          // A failed count fetch used to render five confident zeroes — the
          // one lie this screen could tell a coordinator about their own
          // workload. Now it says so instead.
          error={q.isError}
          errorLabel="Failed to load"
          // 'open' is the resting state and has no cell, so nothing looks
          // selected until the coordinator actually picks a view.
          activeKey={filters.bucket === "open" ? null : filters.bucket}
          onSelect={(key) => {
            const bucket = key as QueueBucket;
            // Pressing the active cell again returns to the open queue,
            // which is the only way back without hunting for a Clear.
            apply({
              ...filters,
              bucket: filters.bucket === bucket ? "open" : bucket,
            });
          }}
        />
      </Reveal>

      {/* ═══ 3. what has been happening ═════════════════════════════ */}
      <Reveal index={3}>
        <InsightsPanels
          insights={first?.insights}
          loading={q.isPending}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => void q.refetch()}
          requested={debouncedRange}
        />
      </Reveal>

      {/* ═══ 4. needs attention ═════════════════════════════════════ */}
      <Reveal index={4}>
        <section aria-labelledby="hs-queue-heading">
          <Panel
            className={cn(
              "transition-opacity",
              q.isFetching && !q.isFetchingNextPage && !q.isPending
                ? "opacity-60"
                : null,
            )}
          >
            {/* §C.2's tinted, ruled head strip — every class is `PanelHead`'s
                own. It is written out here for ONE reason: this section is
                named by `aria-labelledby`, and `PanelHead` has nowhere to put
                the `id` that pointer needs. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border/70 bg-surface-2/40 px-4 py-3 sm:px-5">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-text [&_svg]:size-[15px]"
              >
                <IconAlertTriangle stroke={1.6} />
              </span>
              <h2 id="hs-queue-heading" className={cn("text-text-1", T.h2)}>
                Needs attention
              </h2>
              {/* The sort rule, stated. A queue that reorders itself by rules
                  the reader cannot see is a queue they stop trusting. */}
              <span className="ml-auto shrink-0 text-[11px] text-text-3">
                overdue first, then priority, then age
              </span>
            </div>

            <ListState
              loading={q.isPending}
              error={q.isError ? (q.error as Error).message : null}
              onRetry={() => void q.refetch()}
              isEmpty={rows.length === 0}
              empty={
                filtered
                  ? {
                      icon: IconSearch,
                      titleEn: "No concerns match these filters.",
                      bodyEn: "Widen the filters, or clear them.",
                      action: { label: "Clear filters", onClick: clearAll },
                    }
                  : {
                      icon: IconMoodSmile,
                      titleEn: "Everything is under control.",
                      bodyEn: "Nothing is waiting on you right now.",
                    }
              }
            >
              <QueueRows rows={rows} />
            </ListState>

            {/* Inside the card, on a solid rule — the ERP's canonical footer
                placement for a list card (§E.6), rather than a button left
                floating under it. */}
            {q.hasNextPage ? (
              <div className="border-t border-border">
                <LoadMore
                  onClick={() => void q.fetchNextPage()}
                  loading={q.isFetchingNextPage}
                  label="Load more"
                />
              </div>
            ) : null}
          </Panel>
        </section>
      </Reveal>
    </div>
  );
}

// ─── the queue's rows ──────────────────────────────────────────────────────

function QueueRows({ rows }: { rows: QueueRow[] }) {
  return (
    <>
      {/* ── cards, < 768 ───────────────────────────────────────────────── */}
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            {/* The queue's whole reason for existing is "open this one next",
                so the card is the link — into the WORKSPACE, where a
                coordinator can actually act on it.
                The ERP's mobile row card (orders-dashboard.tsx's OrderCard).
                `Panel` no longer ships shadow-sm, so a card that really IS a
                press target says so itself. The overdue left rule stays a
                rule, never a fill. */}
            <Link
              href={`/help-slip/all/${row.id}`}
              className={cn(
                "flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-sm transition-colors outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[.99]",
                row.isOverdue && "border-l-[3px] border-l-status-red",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {row.isOverdue ? (
                    <IconAlertTriangle
                      className="size-4 shrink-0 text-status-red"
                      stroke={1.6}
                      aria-label="Overdue"
                    />
                  ) : null}
                  <span className={cn("num text-text-3", T.caption)}>
                    {row.concernNumber}
                  </span>
                </span>
                <StatusBadge status={row.status} />
              </div>

              <p className={cn("line-clamp-2 text-text-1", T.h3)}>
                {row.title}
              </p>

              <p
                className={cn(
                  "flex flex-wrap items-center gap-x-2 text-text-3",
                  T.caption,
                )}
              >
                <span>{row.employeeName ?? "—"}</span>
                <span aria-hidden>·</span>
                {/* `departmentOf` still takes a locale; "en" is the only one
                    this ERP renders. `name_hi` is never concatenated. */}
                <span>{departmentOf(row)}</span>
                <span aria-hidden>·</span>
                <Age row={row} />
                <PriorityChip priority={row.priority} />
              </p>

              {row.assignedToStatus && row.assignedToStatus !== "active" ? (
                <p className={cn("text-status-red", T.caption)}>
                  Needs reassignment
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* ── table, ≥ 768 ───────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <HScroll bodyClassName="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th className="w-10 px-2" aria-label="Alert" />
                <Th>ID</Th>
                <Th className="hidden lg:table-cell">Employee</Th>
                <Th className="w-full">Concern</Th>
                {/* A figure column, so the header aligns with its cells. */}
                <Th className="text-right">Age</Th>
                <Th className="hidden xl:table-cell">Priority</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Last update</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className={cn(
                    // `relative`, so the ID cell's link can cover the row.
                    "relative",
                    row.isOverdue && "border-l-[3px] border-l-status-red",
                  )}
                >
                  <Td className="px-2">
                    {row.isOverdue ? (
                      <IconAlertTriangle
                        className="size-4 text-status-red"
                        stroke={1.6}
                        aria-label="Overdue"
                      />
                    ) : null}
                  </Td>
                  <Td className="num whitespace-nowrap">
                    <Link
                      href={`/help-slip/all/${row.id}`}
                      aria-label={`${row.concernNumber}: ${row.title}`}
                      className="rounded-field outline-none after:absolute after:inset-0 after:content-[''] hover:text-accent-text focus-visible:text-accent-text focus-visible:underline"
                    >
                      {row.concernNumber}
                    </Link>
                  </Td>
                  <Td className="hidden whitespace-nowrap lg:table-cell">
                    {row.employeeName ?? "—"}
                  </Td>
                  <Td className="max-w-0">
                    <span className="line-clamp-1">{row.title}</span>
                    {row.assignedToStatus &&
                    row.assignedToStatus !== "active" ? (
                      <span className={cn("block text-status-red", T.caption)}>
                        Needs reassignment
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-right">
                    <Age row={row} />
                  </Td>
                  <Td className="hidden xl:table-cell">
                    <PriorityChip priority={row.priority} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={row.status} />
                      {row.isOverdue ? <OverdueBadge /> : null}
                    </span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-text-3 xl:table-cell">
                    {row.lastPublicUpdateAt
                      ? relativeTime(row.lastPublicUpdateAt)
                      : "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </HScroll>
      </div>
    </>
  );
}

/**
 * "3d" / "4h", with the exact filing time on hover and long-press, and the
 * overdue colour past SLA.
 *
 * A relative age is what a coordinator SCANS; an absolute one is what they
 * quote to somebody. Both, and neither hidden behind a click.
 */
function Age({ row }: { row: QueueRow }) {
  return (
    <time
      dateTime={row.createdAt}
      title={absoluteTime(row.createdAt)}
      className={cn(
        "num whitespace-nowrap",
        row.isOverdue ? "font-semibold text-status-red" : "text-text-3",
      )}
    >
      {shortAge(row.createdAt)}
    </time>
  );
}

// ─── the insights half ─────────────────────────────────────────────────────

/**
 * The operational half. Three questions:
 *
 *   1. How are we doing on time?  typical resolution, and the SLA hit rate
 *   2. Are we keeping up?         filed vs resolved, day by day
 *   3. Where is it coming from?   by department, with the overdue share
 *
 * The two headline FIGURES sit first, because they are the fastest read of
 * "are we keeping up" and a chart of one number is a chart nobody reads. They
 * share ONE card — the ERP's Cancellations panel is exactly this shape: a
 * bordered card that names itself, holding a grid of recessed mini-figure
 * tiles. Two headless panels side by side was two cards saying nothing.
 *
 * The two charts below are PANEL cards: a tinted, ruled head over a flush
 * body, which is the shape the ERP gives every card whose body is a plot.
 *
 * All of it comes out of the same request as the queue above — one aggregate,
 * counted in Postgres. A failed fetch shows ONE error card rather than letting
 * four panels fall through to their ordinary empty states, which would have
 * them quietly agreeing that thirty days had no activity when the truth is the
 * query never came back.
 */
function InsightsPanels({
  insights,
  loading,
  error,
  onRetry,
  requested,
}: {
  insights: Insights | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  requested: { from: string; to: string };
}) {
  if (loading || error || !insights) {
    return (
      <Panel className="p-4">
        <ListState
          loading={loading}
          error={error}
          onRetry={onRetry}
          isEmpty={!insights}
          empty={{
            icon: IconTargetArrow,
            titleEn: "No activity to chart yet.",
            bodyEn: "Filed and resolved counts appear once concerns move.",
          }}
        >
          {null}
        </ListState>
      </Panel>
    );
  }

  const labels = insights.daily.map((d) => dayLabel(d.d));
  const { medianHours, resolvedTotal, withinSla } = insights.resolution;
  const slaPct =
    resolvedTotal > 0 ? Math.round((withinSla / resolvedTotal) * 100) : null;

  // The ACTUAL range the server used, not what was asked for — it clamps, and
  // the header has to say what it really plotted. The two disagreeing is the
  // signal that a typed date was out of bounds.
  const clamped =
    insights.from !== requested.from || insights.to !== requested.to;
  const rangeLabel =
    insights.from === insights.to
      ? dayLabel(insights.from)
      : `${dayLabel(insights.from)} – ${dayLabel(insights.to)}`;

  return (
    // gap-3.5 — the ERP dashboard's panel rhythm, the same value the grid
    // below uses, so the seam between the figures card and the charts row is
    // the seam between the two charts.
    <div className="flex flex-col gap-3.5">
      <SectionCard
        title="Resolution performance"
        icon={<IconGauge stroke={1.6} />}
        // Both figures are "of everything resolved in this window", and until
        // now the window's denominator was invisible.
        aside={<CountChip>{resolvedTotal} resolved</CountChip>}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <StatTile
            icon={IconClock}
            labelEn="Typical time to resolve"
            helpEn="The middle of the window, so one slow case does not move it."
            value={medianHours === null ? null : `${medianHours} h`}
          />
          <StatTile
            icon={IconTargetArrow}
            labelEn="Resolved within SLA"
            helpEn="Of everything resolved in this window."
            value={slaPct === null ? null : `${slaPct}%`}
          />
        </div>
      </SectionCard>

      <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* `overflow-visible` because TrendChart's tooltip is an absolutely
            positioned HTML box with `-translate-x-1/2`: on the FIRST point
            (left: 0%) its left half sits outside the plot container, and on the
            last (left: 100%) its right half does. Panel's default
            `overflow-hidden` would shear both. PanelHead rounds its own top
            corners, so the card still reads correctly without the clip. */}
        <Panel className="overflow-visible">
          <PanelHead
            titleEn="Filed and resolved"
            icon={<IconChartLine stroke={1.6} />}
            note={clamped ? `${rangeLabel} (adjusted)` : rangeLabel}
          />
          <div className="p-4 sm:p-5">
            <TrendChart
              labels={labels}
              summary="Concerns filed and resolved on each day of the selected window."
              emptyLabel="Nothing filed in this window yet."
              series={[
                {
                  key: "filed",
                  label: "Filed",
                  values: insights.daily.map((d) => d.filed),
                  ink: "--status-purple",
                },
                {
                  // Amber, not green — see the colour note in charts.tsx. Green
                  // is `resolved` on every badge on this screen, and painting a
                  // resolved COUNT green is how a categorical tone starts being
                  // read as a status.
                  key: "resolved",
                  label: "Resolved",
                  values: insights.daily.map((d) => d.resolved),
                  ink: "--status-amber",
                },
              ]}
            />
          </div>
        </Panel>

        {/* self-start as well as the row's items-start: belt and braces
            against this panel stretching to match the chart beside it — one
            department bar in a card as tall as a 30-day chart is dead space
            with a heading on it, not "airy". */}
        <Panel className="self-start">
          <PanelHead
            titleEn="Where concerns come from"
            icon={<IconBuildingFactory2 stroke={1.6} />}
          />
          <div className="p-4 sm:p-5">
            <BarList
              emptyLabel="No concerns to break down yet."
              unitLabel="total"
              alertLabel="Past its SLA"
              items={insights.byDepartment.map((d) => ({
                key: d.name,
                label: d.name,
                value: d.total,
                alert: d.overdue,
              }))}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/**
 * A headline number and the sentence that makes it mean something.
 *
 * The ERP's mini-figure tile (dashboard-view.tsx's `MiniFig`, spec §G): a
 * recessed `bg-surface-2` well inside the card, an 11px label with its glyph
 * inline, and a 24/700 figure under it. The accent chip lives on the card head
 * above — Order Entry tints an icon, never a block, and never twice in one
 * card.
 *
 * A figure size is for a FIGURE. "No data yet" set at 24px is a sentence
 * shouting that it has nothing to say — and until a coordinator resolves
 * something, both of these tiles say exactly that, which would make the two
 * largest things on the dashboard the two emptiest. A real number keeps the
 * size it earns; the absence drops to body and goes muted, which is what an
 * absence should look like.
 */
function StatTile({
  icon: Glyph,
  labelEn,
  helpEn,
  value,
}: {
  icon: typeof IconClock;
  labelEn: string;
  helpEn: string;
  value: string | null;
}) {
  return (
    <div className="rounded-field border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-3">
        <Glyph className="size-3.5 shrink-0" stroke={1.6} aria-hidden />
        <span className="truncate">{labelEn}</span>
      </div>
      <span
        aria-live="polite"
        className={
          value === null
            ? cn("mt-1.5 block text-text-3", T.body)
            : // The ERP's mini-figure, verbatim (dashboard-view.tsx).
              "num mt-1.5 block text-[24px] leading-none font-bold tracking-[-0.02em] text-text-1"
        }
      >
        {value ?? "No data yet"}
      </span>
      <p className={cn("mt-1.5 text-text-3", T.caption)}>{helpEn}</p>
    </div>
  );
}

// ─── the date-range presets ────────────────────────────────────────────────

/**
 * Today / 7 days / 30 days / This month, plus two dates for anything else.
 *
 * Presets set BOTH dates at once and are highlighted by matching the current
 * from/to against what each one WOULD set — so there is no separate "which
 * preset is active" state that can fall out of sync with the actual range.
 */
function DateRangePresets({
  from,
  to,
  today,
  onChange,
}: {
  from: string;
  to: string;
  today: string;
  onChange: (from: string, to: string) => void;
}) {
  const presets = [
    { key: "today", label: "Today", from: today, to: today },
    { key: "7d", label: "7 days", from: dayKeyMinus(6), to: today },
    { key: "30d", label: "30 days", from: dayKeyMinus(29), to: today },
    {
      key: "month",
      label: "This month",
      from: startOfMonthKey(),
      to: today,
    },
  ];
  const activeKey =
    presets.find((p) => p.from === from && p.to === to)?.key ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activeKey === p.key}
            onClick={() => onChange(p.from, p.to)}
            // 44px + 16px text below md: the minimum touch target for a phone
            // held on the factory floor, and anything under 16px makes iOS
            // Safari auto-zoom on focus and never zoom back out. ui/segmented's
            // md geometry (32px / 13px) from md up.
            className={cn(
              "inline-flex h-11 cursor-pointer items-center rounded-pill border px-3 text-base transition-colors outline-none md:h-8 md:px-2.5 md:text-[13px]",
              "focus-visible:ring-3 focus-visible:ring-ring/40",
              activeKey === p.key
                ? "border-primary bg-accent text-accent-text"
                : "border-border bg-surface text-text-2 hover:border-border-strong",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <DateRangeFields
        from={from}
        to={to}
        maxDate={today}
        onChange={(next) => onChange(next.from ?? from, next.to ?? to)}
      />
    </div>
  );
}

// ─── URL ⇄ filters ─────────────────────────────────────────────────────────

function filtersFromParams(p: URLSearchParams): QueueFilters {
  return {
    bucket: parseQueueBucket(p.get("bucket")),
    departmentId: p.get("department") || null,
    priority: parsePriorityParam(p.get("priority")),
    needsReassignment: p.get("needsReassignment") === "1",
  };
}

function toParams(
  f: QueueFilters,
  range: { from: string; to: string },
  today: string,
): string {
  const p = new URLSearchParams();
  if (f.bucket !== "open") p.set("bucket", f.bucket);
  if (f.departmentId) p.set("department", f.departmentId);
  if (f.priority.length > 0) p.set("priority", f.priority.join(","));
  if (f.needsReassignment) p.set("needsReassignment", "1");
  // Only when they differ from the default window, so a bare /help-slip URL
  // stays bare.
  if (range.from !== dayKeyMinus(29)) p.set("from", range.from);
  if (range.to !== today) p.set("to", range.to);
  return p.toString();
}
