"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
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
import { Bi } from "@/components/help-slip/bilingual";
import { BarList, TrendChart } from "@/components/help-slip/charts";
import {
  DateRangeFields,
  FilterSelect,
  departmentOptions,
  priorityOptions,
} from "@/components/help-slip/filters";
import { KpiStrip, type Kpi } from "@/components/help-slip/kpi-strip";
import {
  ListState,
  LoadMore,
  PageHeader,
  Panel,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import type { ConcernPriority } from "@/db/help-slip/schema";
import { helpSlipGet } from "@/lib/help-slip/api-client";
import { useHelpSlipLocale } from "@/lib/help-slip/context";
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
 * ── WHAT IS DELIBERATELY MISSING ──────────────────────────────────────────
 * The source's per-row quick actions (Start, Assign to me, and the phone's
 * "…" sheet) are WRITES. This phase is read screens; a Start button that
 * silently does nothing is worse than no Start button.
 */
export function PcDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useHelpSlipLocale();

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
      labelHi: "नई",
      value: counts?.new ?? 0,
      icon: IconInbox,
      tone: "violet",
    },
    {
      key: "in_progress",
      labelEn: "In Progress",
      labelHi: "चालू",
      value: counts?.in_progress ?? 0,
      icon: IconLoader2,
      tone: "amber",
    },
    {
      key: "waiting",
      labelEn: "Waiting",
      labelHi: "रुकी",
      value: counts?.waiting ?? 0,
      icon: IconPlayerPause,
      tone: "blue",
    },
    {
      key: "resolved",
      labelEn: "Resolved",
      labelHi: "हल",
      value: counts?.resolved ?? 0,
      icon: IconCircleCheck,
      tone: "green",
    },
    {
      key: "overdue",
      labelEn: "Overdue",
      labelHi: "देर",
      value: counts?.overdue ?? 0,
      icon: IconAlertTriangle,
      emphasis: "overdue",
    },
  ];

  const clearAll = () =>
    write({ bucket: "open", departmentId: null, priority: [], needsReassignment: false }, range);

  return (
    <div className="flex flex-col">
      <Reveal index={0}>
        <PageHeader
          titleEn="Dashboard"
          titleHi="डैशबोर्ड"
          subtitle={
            <Bi en="What needs you now." hi="अभी आपकी ज़रूरत कहाँ है।" />
          }
          meta={total > 0 ? `Showing ${rows.length} of ${total}` : null}
        />
      </Reveal>

      {/* gap-10 (40px): four blocks answering four different questions —
          narrow it, what's true now, what's been happening, what needs me. A
          flat 16px everywhere read as one long list of loosely related cards.
          The tighter cluster rhythm still applies INSIDE each block. */}
      <div className="flex flex-col gap-10 pb-10">
        {/* ═══ 1. filters ═════════════════════════════════════════════ *
         * A card, not bare controls on the canvas — every other block on this
         * screen is a card and this row was the one thing floating. p-4 rather
         * than the full panel padding: a filter row is controls, not prose. */}
        <Reveal index={1}>
          <Panel className="flex flex-wrap items-center gap-3 p-4">
            <FilterSelect
              ariaLabel="Department"
              value={filters.departmentId ?? ""}
              onChange={(v) => apply({ ...filters, departmentId: v || null })}
              options={departmentOptions(
                first?.departments ?? [],
                "All departments",
              )}
              locale={locale}
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
              options={priorityOptions("All priorities", locale)}
              locale={locale}
            />

            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={filters.needsReassignment}
                onChange={(e) =>
                  apply({ ...filters, needsReassignment: e.target.checked })
                }
                className="size-[17px] shrink-0 accent-[var(--primary)]"
              />
              <span className={cn("deva text-text-2", T.bodySm)}>
                <Bi en="Needs reassignment" hi="दोबारा सौंपना है" />
              </span>
            </label>

            <span aria-hidden className="h-6 w-px shrink-0 bg-border" />

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
                className={cn(
                  "deva cursor-pointer text-accent-text underline underline-offset-2",
                  T.bodySm,
                )}
              >
                <Bi en="Clear filters" hi="फ़िल्टर हटाएँ" />
              </button>
            ) : null}
          </Panel>
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
            locale={locale}
            requested={debouncedRange}
          />
        </Reveal>

        {/* ═══ 4. needs attention ═════════════════════════════════════ */}
        <Reveal index={4}>
          <section
            aria-labelledby="hs-queue-heading"
            className="flex flex-col gap-3"
          >
            <h2 id="hs-queue-heading" className={cn("deva text-text-1", T.h3)}>
              <Bi en="Needs attention" hi="ध्यान चाहिए" />
            </h2>

            <Panel
              className={cn(
                "overflow-hidden transition-opacity",
                q.isFetching && !q.isFetchingNextPage && !q.isPending
                  ? "opacity-60"
                  : null,
              )}
            >
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
                        titleHi: "इन फ़िल्टर से कोई शिकायत नहीं मिली।",
                        bodyEn: "Widen the filters, or clear them.",
                        bodyHi: "फ़िल्टर बढ़ाएँ, या हटा दें।",
                        action: { label: "Clear filters", onClick: clearAll },
                      }
                    : {
                        icon: IconMoodSmile,
                        titleEn: "Everything is under control.",
                        titleHi: "सब कुछ नियंत्रण में है।",
                        bodyEn: "Nothing is waiting on you right now.",
                        bodyHi: "अभी आपके पास कुछ लंबित नहीं है।",
                      }
                }
              >
                <QueueRows rows={rows} locale={locale} />
              </ListState>
            </Panel>

            {q.hasNextPage ? (
              <LoadMore
                onClick={() => void q.fetchNextPage()}
                loading={q.isFetchingNextPage}
                label="Load more"
                labelHi="और दिखाएँ"
              />
            ) : null}
          </section>
        </Reveal>
      </div>
    </div>
  );
}

// ─── the queue's rows ──────────────────────────────────────────────────────

function QueueRows({
  rows,
  locale,
}: {
  rows: QueueRow[];
  locale: "en" | "hi";
}) {
  return (
    <>
      {/* ── cards, < 768 ───────────────────────────────────────────────── */}
      <ul className="flex flex-col gap-3 p-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex flex-col gap-2 rounded-card border border-border p-3",
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
              <StatusBadge status={row.status} locale={locale} />
            </div>

            <p className={cn("deva line-clamp-2 text-text-1", T.h3)}>
              {row.title}
            </p>

            <p
              className={cn(
                "deva flex flex-wrap items-center gap-x-2 text-text-3",
                T.caption,
              )}
            >
              <span>{row.employeeName ?? "—"}</span>
              <span aria-hidden>·</span>
              <span>{departmentOf(row, locale)}</span>
              <span aria-hidden>·</span>
              <Age row={row} locale={locale} />
              <PriorityChip priority={row.priority} locale={locale} />
            </p>

            {row.assignedToStatus && row.assignedToStatus !== "active" ? (
              <p className={cn("deva text-status-red", T.caption)}>
                <Bi en="Needs reassignment" hi="दोबारा सौंपना है" />
              </p>
            ) : null}
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
                <Th>Age</Th>
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
                  <Td className="num whitespace-nowrap">{row.concernNumber}</Td>
                  <Td className="deva hidden whitespace-nowrap lg:table-cell">
                    {row.employeeName ?? "—"}
                  </Td>
                  <Td className="deva max-w-0">
                    <span className="line-clamp-1">{row.title}</span>
                    {row.assignedToStatus &&
                    row.assignedToStatus !== "active" ? (
                      <span
                        className={cn(
                          "deva block text-status-red",
                          T.caption,
                        )}
                      >
                        <Bi
                          en="Needs reassignment"
                          hi="दोबारा सौंपना है"
                        />
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Age row={row} locale={locale} />
                  </Td>
                  <Td className="hidden xl:table-cell">
                    <PriorityChip priority={row.priority} locale={locale} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={row.status} locale={locale} />
                      {row.isOverdue ? <OverdueBadge locale={locale} /> : null}
                    </span>
                  </Td>
                  <Td className="deva hidden whitespace-nowrap text-text-3 xl:table-cell">
                    {row.lastPublicUpdateAt
                      ? relativeTime(row.lastPublicUpdateAt, locale)
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
function Age({ row, locale }: { row: QueueRow; locale: "en" | "hi" }) {
  return (
    <time
      dateTime={row.createdAt}
      title={absoluteTime(row.createdAt, locale)}
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
 * "are we keeping up" and a chart of one number is a chart nobody reads.
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
  locale,
  requested,
}: {
  insights: Insights | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  locale: "en" | "hi";
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
            titleHi: "अभी चार्ट के लिए कुछ नहीं।",
            bodyEn: "Filed and resolved counts appear once concerns move.",
            bodyHi: "शिकायतें आगे बढ़ने पर यहाँ आँकड़े दिखेंगे।",
          }}
        >
          {null}
        </ListState>
      </Panel>
    );
  }

  const labels = insights.daily.map((d) => dayLabel(d.d, locale));
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
      ? dayLabel(insights.from, locale)
      : `${dayLabel(insights.from, locale)} – ${dayLabel(insights.to, locale)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          icon={IconClock}
          labelEn="Typical time to resolve"
          labelHi="हल होने का सामान्य समय"
          helpEn="The middle of the window, so one slow case does not move it."
          helpHi="अवधि का मध्य, ताकि एक धीमा मामला इसे न बदले।"
          value={medianHours === null ? null : `${medianHours} h`}
        />
        <StatTile
          icon={IconTargetArrow}
          labelEn="Resolved within SLA"
          labelHi="SLA के भीतर हल"
          helpEn="Of everything resolved in this window."
          helpHi="इस अवधि में हल हुई हर शिकायत में से।"
          value={slaPct === null ? null : `${slaPct}%`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <Panel className="flex flex-col gap-4 p-5">
          <PanelTitle
            titleEn="Filed and resolved"
            titleHi="दर्ज और हल"
            note={clamped ? `${rangeLabel} (adjusted)` : rangeLabel}
          />
          <TrendChart
            labels={labels}
            summary="Concerns filed and resolved on each day of the selected window."
            emptyLabel={
              <Bi
                en="Nothing filed in this window yet."
                hi="इस अवधि में अभी कुछ दर्ज नहीं हुआ।"
              />
            }
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
        </Panel>

        {/* self-start as well as the row's items-start: belt and braces
            against this panel stretching to match the chart beside it — one
            department bar in a card as tall as a 30-day chart is dead space
            with a heading on it, not "airy". */}
        <Panel className="flex flex-col gap-4 self-start p-5">
          <PanelTitle
            titleEn="Where concerns come from"
            titleHi="शिकायतें कहाँ से आती हैं"
          />
          <BarList
            emptyLabel={
              <Bi
                en="No concerns to break down yet."
                hi="अभी विभाजन के लिए कुछ नहीं।"
              />
            }
            unitLabel={<Bi en="total" hi="कुल" />}
            alertLabel={<Bi en="Past its SLA" hi="SLA से बाहर" />}
            items={insights.byDepartment.map((d) => ({
              key: d.name,
              label: d.name,
              value: d.total,
              alert: d.overdue,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

function PanelTitle({
  titleEn,
  titleHi,
  note,
}: {
  titleEn: string;
  titleHi: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className={cn("deva text-text-1", T.h3)}>
        {titleEn}
        <span className="deva hi"> ({titleHi})</span>
      </h3>
      {note ? (
        <span className={cn("num text-text-3", T.caption)}>{note}</span>
      ) : null}
    </div>
  );
}

/**
 * A headline number and the sentence that makes it mean something.
 *
 * `display` size is for a FIGURE. "No data yet" set at 30px is a sentence
 * shouting that it has nothing to say — and until a coordinator resolves
 * something, both of these tiles say exactly that, which would make the two
 * largest things on the dashboard the two emptiest. A real number keeps the
 * size it earns; the absence drops to body and goes muted, which is what an
 * absence should look like.
 */
function StatTile({
  icon: Glyph,
  labelEn,
  labelHi,
  helpEn,
  helpHi,
  value,
}: {
  icon: typeof IconClock;
  labelEn: string;
  labelHi: string;
  helpEn: string;
  helpHi: string;
  value: string | null;
}) {
  return (
    <Panel className="flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("deva text-text-3", T.caption)}>
          <Bi en={labelEn} hi={labelHi} />
        </span>
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-field bg-accent text-accent-text"
        >
          <Glyph className="size-[17px]" stroke={1.6} />
        </span>
      </div>
      <span
        aria-live="polite"
        className={
          value === null
            ? cn("deva text-text-3", T.body)
            : cn("num text-text-1", T.display)
        }
      >
        {value ?? <Bi en="No data yet" hi="अभी डेटा नहीं" />}
      </span>
      <span className={cn("deva text-text-3", T.caption)}>
        <Bi en={helpEn} hi={helpHi} />
      </span>
    </Panel>
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
    { key: "today", en: "Today", hi: "आज", from: today, to: today },
    { key: "7d", en: "7 days", hi: "7 दिन", from: dayKeyMinus(6), to: today },
    { key: "30d", en: "30 days", hi: "30 दिन", from: dayKeyMinus(29), to: today },
    {
      key: "month",
      en: "This month",
      hi: "इस महीने",
      from: startOfMonthKey(),
      to: today,
    },
  ];
  const activeKey =
    presets.find((p) => p.from === from && p.to === to)?.key ?? null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activeKey === p.key}
            onClick={() => onChange(p.from, p.to)}
            className={cn(
              "deva inline-flex h-11 cursor-pointer items-center rounded-pill border px-3 transition-colors outline-none",
              T.bodySm,
              "focus-visible:ring-3 focus-visible:ring-ring/40",
              activeKey === p.key
                ? "border-primary bg-accent text-accent-text"
                : "border-border bg-surface text-text-2 hover:border-border-strong",
            )}
          >
            {p.en}
            <span className="deva hi ml-1">({p.hi})</span>
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
