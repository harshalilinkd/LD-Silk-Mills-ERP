import type { ComponentType } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconClockHour4,
  IconGauge,
  IconListDetails,
  IconPhoneCall,
  IconRepeat,
  IconStar,
  IconTrendingUp,
} from "@tabler/icons-react";

import { loadCrmAnalytics } from "@/lib/order-entry/crm-query";
import { formatCount } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CHART_COLOURS,
  CountBars,
  CoverageMeter,
  OnTimeQuadrant,
  QueueBar,
  RatingTrendLine,
} from "@/components/order-entry/crm/charts";

// CRM analytics — what all the follow-up work adds up to, over an optional
// date window on delivery date. Ported layout/priority order from Order
// Entry's standalone analytics-view.tsx, rebuilt against this shell's own
// chart components (no recharts here).
//
// The rule this page is built on: an unworked queue must LOOK unworked. Every
// section below could otherwise render a perfectly convincing zero — a flat
// rating line, an empty complaints board — and a reader would take that as
// "nothing is wrong" when it actually means "nobody has called anyone yet".
// So coverage sits first (it qualifies every other number on the page), and
// when sampleSize is 0 the "worked calls" sections collapse into one plain
// notice instead of four empty-looking charts.

function formatWindowDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Small headline-number card — same recipe as the Order Entry dashboard's
 * Kpi(), sized down to sit alongside the coverage meter. */
function Kpi({
  icon: Icon,
  iconClass,
  value,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface-2/40 p-3">
      <div
        className={`mb-2.5 flex size-7 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon className="size-[15px]" />
      </div>
      <div className="font-mono text-[18px] font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-[2px] text-[11px] text-text-3">{label}</div>
    </div>
  );
}

/** A small labelled number, for stats that aren't a chart. */
function StatCallout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface-2/40 px-4 py-3">
      <div className="font-mono text-[20px] font-bold leading-none tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-text-3">{label}</div>
    </div>
  );
}

/** Section card — rounded-[10px] border border-border bg-surface, matching
 * the rest of this shell. Chart components below already carry their own
 * horizontal/bottom padding (px-4 sm:px-5 pb-5), so the body here stays
 * flush rather than doubling up on insets. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      <div className="px-4 pt-[18px] pb-3 sm:px-5">
        <h2 className="text-[14.5px] font-bold text-text-1">{title}</h2>
        {note ? <p className="mt-0.5 text-[12px] text-text-3">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default async function CrmAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const from = (sp.from ?? "").trim() || null;
  const to = (sp.to ?? "").trim() || null;

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const data = await loadCrmAnalytics(params);

  const worked = data.sampleSize > 0;
  const onTimeTotal =
    data.onTime.bothOnTime +
    data.onTime.bothLate +
    data.onTime.weLateTheyFine +
    data.onTime.weOnTimeTheyNot;

  const rangeLabel =
    from || to
      ? `${from ? formatWindowDate(from) : "the beginning"} – ${to ? formatWindowDate(to) : "now"}`
      : "all time";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          CRM analytics
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Delivered {rangeLabel} · {formatCount(data.coverage.followups)} follow-up
          {data.coverage.followups === 1 ? "" : "s"} in range
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border bg-surface p-2.5"
      >
        <span className="text-[12px] text-text-3">Delivered between</span>
        <Input
          type="date"
          name="from"
          aria-label="From"
          defaultValue={from ?? ""}
          max={to ?? undefined}
          className="h-9 w-[152px] text-[12.5px]"
        />
        <span className="text-[12px] text-text-3">and</span>
        <Input
          type="date"
          name="to"
          aria-label="To"
          defaultValue={to ?? ""}
          min={from ?? undefined}
          className="h-9 w-[152px] text-[12.5px]"
        />
        <Button type="submit" size="sm">
          Apply
        </Button>
        {from || to ? (
          <Link
            href="/crm/analytics"
            className="rounded-lg px-2 py-1 text-[12px] font-medium text-text-3 hover:bg-surface-2 hover:text-text-1"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {/* Coverage — the honesty metric. Always shown: it's meaningful even
          when nobody has finished a call, since it counts CONTACTED, not
          completed. */}
      <Section
        title="Coverage"
        note="The honesty metric — read this first. Every other figure on this page describes a slice of these calls."
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {data.coverage.pct !== null ? (
              <CoverageMeter
                pct={data.coverage.pct}
                contacted={data.coverage.contacted}
                followups={data.coverage.followups}
              />
            ) : (
              <div className="px-4 pb-5 sm:px-5">
                <EmptyState
                  icon={IconGauge}
                  title="No delivered orders in this range"
                  description="There is nothing to have called yet."
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5 content-start px-4 pb-5 sm:px-5 lg:border-l lg:border-border lg:pl-5">
            <Kpi
              icon={IconStar}
              iconClass="bg-status-amber-dim text-status-amber"
              value={
                data.ratings.avgOverall != null
                  ? data.ratings.avgOverall.toFixed(1)
                  : "—"
              }
              label="Avg rating"
            />
            <Kpi
              icon={IconAlertTriangle}
              iconClass="bg-status-red-dim text-status-red"
              value={formatCount(data.ratings.escalated)}
              label="Escalated"
            />
            <Kpi
              icon={IconListDetails}
              iconClass="bg-status-blue-dim text-status-blue"
              value={`${formatCount(data.complaints.total)}/${formatCount(data.complaints.open)}`}
              label="Complaints / open"
            />
            <Kpi
              icon={IconRepeat}
              iconClass="bg-status-green-dim text-status-green"
              value={formatCount(data.reorder.yes + data.reorder.maybe)}
              label="Reorder yes + maybe"
            />
          </div>
        </div>
      </Section>

      {/* Where the queue stands — the work itself, worked or not. Kept
          visible even at sampleSize 0: an unworked queue full of "Waiting"
          is exactly the finding. */}
      <Section
        title="Where the queue stands"
        note="Every follow-up in range, whatever its status."
      >
        {data.coverage.followups > 0 ? (
          <QueueBar
            parts={[
              { key: "due", label: "Waiting", count: data.funnel.due, color: CHART_COLOURS.due },
              { key: "prog", label: "In progress", count: data.funnel.inProgress, color: CHART_COLOURS.progress },
              { key: "done", label: "Completed", count: data.funnel.completed, color: CHART_COLOURS.done },
              { key: "unre", label: "Unreachable", count: data.funnel.unreachable, color: CHART_COLOURS.unreachable },
              { key: "nreq", label: "Not required", count: data.funnel.notRequired, color: CHART_COLOURS.notRequired },
            ]}
          />
        ) : (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState
              icon={IconListDetails}
              title="No delivered orders in this range"
              description="There is no queue to describe."
            />
          </div>
        )}
      </Section>

      {!worked ? (
        <div className="rounded-[10px] border border-border bg-surface">
          <EmptyState
            icon={IconPhoneCall}
            title="Nobody has completed a follow-up in this window yet"
            description={`The queue holds ${formatCount(data.funnel.due + data.funnel.inProgress)} order${data.funnel.due + data.funnel.inProgress === 1 ? "" : "s"} waiting on a call. Ratings, the on-time comparison, complaints, and reorder intent all come from completed calls, so there is nothing yet to plot below — not because nothing is wrong, but because nobody has looked.`}
          />
        </div>
      ) : (
        <>
          {/* Ratings — average, monthly trend, and where the score is lost. */}
          <Section
            title="Ratings"
            note="Average overall score, the monthly trend, and where marks are lost."
          >
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 pb-4 sm:px-5">
              <div>
                <div className="font-mono text-[28px] leading-none font-bold tracking-[-0.02em] text-text-1">
                  {data.ratings.avgOverall != null
                    ? data.ratings.avgOverall.toFixed(2)
                    : "—"}
                </div>
                <div className="mt-1 text-[11.5px] text-text-3">
                  average overall, out of 5
                </div>
              </div>
              <div className="text-[12.5px] text-text-3">
                {formatCount(data.ratings.rated)} rated call
                {data.ratings.rated === 1 ? "" : "s"}
                {data.ratings.escalated > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-semibold text-status-red">
                      {formatCount(data.ratings.escalated)}
                    </span>{" "}
                    escalated
                  </>
                ) : null}
              </div>
            </div>

            {data.ratings.trend.length > 1 ? (
              <RatingTrendLine trend={data.ratings.trend} />
            ) : (
              <div className="px-4 pb-5 sm:px-5">
                <EmptyState
                  icon={IconTrendingUp}
                  title={
                    data.ratings.trend.length === 1
                      ? "One month of ratings so far"
                      : "No rated calls yet"
                  }
                  description={
                    data.ratings.trend.length === 1
                      ? "A trend needs two months to compare."
                      : "Needs rated calls across two or more months."
                  }
                />
              </div>
            )}

            <div className="border-t border-border pt-4">
              <h3 className="px-4 text-[12px] font-semibold text-text-3 sm:px-5">
                Where the score is lost, worst first
              </h3>
              <div className="mt-2">
                {data.ratings.subs.length > 0 ? (
                  <CountBars
                    tone="warning"
                    outOf={5}
                    rows={data.ratings.subs.map((s) => ({
                      key: s.key,
                      label: s.label,
                      value: s.avg,
                    }))}
                  />
                ) : (
                  <div className="px-4 pb-5 sm:px-5">
                    <EmptyState
                      icon={IconStar}
                      title="No sub-scores yet"
                      description="Rating criteria come from CRM settings."
                    />
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Our deadline vs the customer — the one shape a bar can't
              replace: where the two disagree is the finding. */}
          <Section
            title="Our deadline vs the customer"
            note="Where we and the customer disagree is the finding."
          >
            {onTimeTotal > 0 ? (
              <OnTimeQuadrant data={data.onTime} />
            ) : (
              <div className="px-4 pb-5 sm:px-5">
                <EmptyState
                  icon={IconClockHour4}
                  title="No completed calls with an on-time answer yet"
                  description="Needs a call where the customer said whether delivery felt on time."
                />
              </div>
            )}
          </Section>

          {/* Complaints — what's going wrong, sliced three ways, plus how
              long they take to close. */}
          <Section
            title="Complaints"
            note={`${formatCount(data.complaints.total)} logged in range · ${formatCount(data.complaints.open)} still open`}
          >
            <div className="flex flex-wrap gap-3 px-4 pb-4 sm:px-5">
              <StatCallout
                label="Median close time"
                value={
                  data.complaints.medianTatDays != null
                    ? `${data.complaints.medianTatDays}d`
                    : "—"
                }
              />
              <StatCallout
                label="Rate per 100 delivered"
                value={
                  data.complaints.ratePer100 != null
                    ? `${data.complaints.ratePer100}`
                    : "—"
                }
              />
            </div>

            {data.complaints.total > 0 ? (
              <div className="grid grid-cols-1 border-t border-border pt-4 lg:grid-cols-3">
                <div>
                  <h3 className="px-4 text-[12px] font-semibold text-text-3 sm:px-5">
                    By category
                  </h3>
                  {data.complaints.byCategory.length > 0 ? (
                    <CountBars
                      tone="danger"
                      rows={data.complaints.byCategory.map((c) => ({
                        key: c.key,
                        label: c.key,
                        value: c.count,
                      }))}
                    />
                  ) : (
                    <p className="px-4 pb-5 pt-2 text-[12px] text-text-3 sm:px-5">
                      No data.
                    </p>
                  )}
                </div>
                <div className="lg:border-l lg:border-border">
                  <h3 className="px-4 text-[12px] font-semibold text-text-3 sm:px-5">
                    By department
                  </h3>
                  {data.complaints.byDept.length > 0 ? (
                    <CountBars
                      tone="danger"
                      rows={data.complaints.byDept.map((c) => ({
                        key: c.key,
                        label: c.key,
                        value: c.count,
                      }))}
                    />
                  ) : (
                    <p className="px-4 pb-5 pt-2 text-[12px] text-text-3 sm:px-5">
                      No data.
                    </p>
                  )}
                </div>
                <div className="lg:border-l lg:border-border">
                  <h3 className="px-4 text-[12px] font-semibold text-text-3 sm:px-5">
                    By transport
                  </h3>
                  {data.complaints.byTransport.length > 0 ? (
                    <CountBars
                      tone="danger"
                      rows={data.complaints.byTransport.map((c) => ({
                        key: c.key,
                        label: c.key,
                        value: c.count,
                      }))}
                    />
                  ) : (
                    <p className="px-4 pb-5 pt-2 text-[12px] text-text-3 sm:px-5">
                      No data.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
                <EmptyState
                  icon={IconAlertTriangle}
                  title="No complaints logged in this range"
                  description="With coverage this low, that may mean nobody asked — not that nobody had an issue."
                />
              </div>
            )}
          </Section>

          {/* Reorder intent — three numbers, not a chart. */}
          <Section title="Reorder intent" note="What customers said about buying again.">
            <div className="grid grid-cols-3 gap-3 px-4 pb-5 sm:px-5">
              <div className="rounded-[10px] border border-border bg-surface-2/40 px-4 py-3.5 text-center">
                <div className="font-mono text-[24px] leading-none font-bold text-status-green">
                  {formatCount(data.reorder.yes)}
                </div>
                <div className="mt-1.5 text-[11px] text-text-3">Yes</div>
              </div>
              <div className="rounded-[10px] border border-border bg-surface-2/40 px-4 py-3.5 text-center">
                <div className="font-mono text-[24px] leading-none font-bold text-status-amber">
                  {formatCount(data.reorder.maybe)}
                </div>
                <div className="mt-1.5 text-[11px] text-text-3">Maybe</div>
              </div>
              <div className="rounded-[10px] border border-border bg-surface-2/40 px-4 py-3.5 text-center">
                <div className="font-mono text-[24px] leading-none font-bold text-status-blue">
                  {formatCount(data.reorder.sample)}
                </div>
                <div className="mt-1.5 text-[11px] text-text-3">
                  Asked for a sample
                </div>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
