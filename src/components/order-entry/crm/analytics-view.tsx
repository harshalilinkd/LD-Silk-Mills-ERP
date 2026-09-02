"use client";

// CRM analytics — docs/SCREENS.md §7.6
//
// What the follow-up work adds up to. Read-only.
//
// **The rule this screen is built on: an unworked queue must LOOK unworked.**
// Every panel here would otherwise render a perfectly convincing zero — 0%
// complaints, a flat rating line, an empty Pareto — and a reader would take
// that as "nothing is wrong" when it means "nobody has called anyone". So each
// panel states what it still needs, and coverage sits first because it is the
// number that qualifies every other number on the page.
//
// There were nine panels. Three of them — complaints by category, by
// department, by transport — were the same list grouped three ways, each
// drawing a single bar; they are ONE panel with a toggle now, the way the
// issues board already does it. Reorder intent lost its panel too: three
// numbers are a KPI tile, not a chart.
//
// The charts are this app's inline-SVG/CSS set (`./charts`). The spec's file
// split exists to keep Recharts out of the initial chunk; there is no Recharts
// in this module at all, so the hazard cannot occur and the split is moot.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconHourglassEmpty,
  IconPhoneCall,
  IconScale,
  IconShoppingBag,
  IconStack2,
  IconStar,
  IconTrendingUp,
} from "@tabler/icons-react";

import { categoryLabel, type CrmAnalytics } from "@/lib/order-entry/crm";
import { formatCount } from "@/lib/order-entry/orders";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { apiGet } from "./api-client";
import {
  CHART_COLOURS,
  CountBars,
  CoverageMeter,
  OnTimeQuadrant,
  QueueBar,
  RatingTrendLine,
} from "./charts";

// The department that has to act. The raw enum is shouted and ambiguous.
const DEPT_LABEL: Record<string, string> = {
  OPS: "Operations",
  DISPATCH: "Dispatch",
  DESIGN: "Design",
  ACCOUNTS: "Accounts",
  TRANSPORT: "Transport",
  SALES: "Sales",
};

const inputCls =
  "h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

/** A panel with nothing to plot yet, saying WHAT IT NEEDS rather than drawing zero. */
function Awaiting({ need }: { need: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-5 py-8 text-center">
      <span className="grid size-9 place-items-center rounded-full bg-chip text-text-2">
        <IconHourglassEmpty className="size-4" />
      </span>
      <p className="max-w-[300px] text-[12.5px] leading-relaxed text-balance text-text-2">
        {need}
      </p>
    </div>
  );
}

function Panel({
  title,
  note,
  icon,
  aside,
  children,
  className,
}: {
  title: string;
  note?: string;
  /** Makes a wall of panels scannable — you find one by its mark. */
  icon?: React.ReactNode;
  /** A control that belongs to this panel, right-aligned in its header. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface transition-shadow duration-200 hover:shadow-md",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border/70 bg-surface-2/40 px-4 py-3 sm:px-5">
        {icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-text [&_svg]:size-[15px]">
            {icon}
          </span>
        ) : null}
        <h2 className="text-[15px] font-semibold text-text-1">{title}</h2>
        {note ? (
          <span className="text-[12px] font-medium text-text-2">{note}</span>
        ) : null}
        {aside ? <div className="ml-auto">{aside}</div> : null}
      </div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

export function CrmAnalyticsView() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();

  const q = useQuery({
    queryKey: ["crm-analytics", qs],
    queryFn: () =>
      apiGet<CrmAnalytics>(`/api/crm/analytics${qs ? `?${qs}` : ""}`),
    placeholderData: (prev) => prev,
  });

  const d = q.data;
  const worked = (d?.sampleSize ?? 0) > 0;

  // One complaints panel, sliced three ways — the same "who has to act vs what
  // keeps happening" toggle the issues board uses.
  const [slice, setSlice] = React.useState<"category" | "dept" | "transport">(
    "category",
  );
  const sliceRows = React.useMemo(() => {
    if (!d) return [];
    if (slice === "category") {
      return d.complaints.byCategory.map((c) => ({
        key: c.key,
        label: categoryLabel(c.key),
        value: c.count,
      }));
    }
    if (slice === "dept") {
      return d.complaints.byDept.map((c) => ({
        key: c.key,
        label: DEPT_LABEL[c.key] ?? c.key,
        value: c.count,
      }));
    }
    return d.complaints.byTransport.map((c) => ({
      key: c.key,
      label: c.key,
      value: c.count,
    }));
  }, [d, slice]);

  const onTimeTotal = d
    ? d.onTime.bothOnTime +
      d.onTime.bothLate +
      d.onTime.weLateTheyFine +
      d.onTime.weOnTimeTheyNot
    : 0;
  const waiting = d ? d.funnel.due + d.funnel.inProgress : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Region A — four tiles. NONE of them filter: this screen has no list to
          narrow. The first tile's tone is the only conditional one on the page:
          amber when anything is waiting, slate when nothing is. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconPhoneCall />}
          label="Waiting to be called"
          value={d ? formatCount(waiting) : "—"}
          sub={
            d ? `${formatCount(d.coverage.followups)} delivered in range` : undefined
          }
          tone={d && waiting > 0 ? "warning" : "neutral"}
        />
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconStar />}
          label="Average rating"
          value={
            d?.ratings.avgOverall != null ? d.ratings.avgOverall.toFixed(1) : "—"
          }
          sub={d ? `${formatCount(d.ratings.rated)} rated` : undefined}
          tone="warning"
        />
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconAlertTriangle />}
          label="Complaint rate"
          value={
            d?.complaints.ratePer100 != null ? `${d.complaints.ratePer100}` : "—"
          }
          sub="per 100 delivered orders"
          tone="danger"
        />
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconShoppingBag />}
          label="Reorder signals"
          value={
            d
              ? formatCount(d.reorder.yes + d.reorder.maybe + d.reorder.sample)
              : "—"
          }
          sub={
            d
              ? `${formatCount(d.reorder.yes)} buying again · ${formatCount(d.reorder.sample)} asked for a sample`
              : undefined
          }
          tone="success"
        />
      </div>

      {/* Region B — the range bar. */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2.5">
        <span className="text-[12px] text-text-2">Delivered between</span>
        <input
          type="date"
          aria-label="From"
          className={inputCls}
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-[12px] text-text-2">to</span>
        <input
          type="date"
          aria-label="To"
          className={inputCls}
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
        {from || to ? (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="cursor-pointer rounded-field px-1.5 py-1 text-[12px] font-medium text-text-2 hover:bg-chip hover:text-text-1"
          >
            Clear
          </button>
        ) : null}
        <span className="ml-auto text-[12px] text-text-2">
          {d ? `${formatCount(d.coverage.followups)} follow-ups in range` : ""}
        </span>
      </div>

      {/* Said ONCE, plainly, at the top — not repeated in six empty panels. */}
      {d && !worked ? (
        <div className="rounded-card border-l-[3px] border-l-status-amber bg-status-amber-dim px-4 py-3 text-[12.5px] leading-relaxed text-text-2">
          <b className="text-text-1">No follow-up has been completed yet.</b> The
          queue holds{" "}
          <span className="num font-semibold">
            {formatCount(d.coverage.followups)}
          </span>{" "}
          orders waiting for a call. Until they are worked, every panel below is
          empty because nothing has happened — not because nothing is wrong.
        </div>
      ) : null}

      {q.isError ? (
        <div className="rounded-card border border-status-red/30 bg-status-red-dim px-4 py-3 text-[12.5px]">
          <div className="font-semibold text-status-red">
            Could not load CRM analytics
          </div>
          <div className="mt-1 text-text-2">
            {(q.error as Error)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="mt-2.5 cursor-pointer rounded-field border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-text-2 hover:bg-chip hover:text-text-1"
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* Region C — SIX panels, one per question worth asking.
          `items-stretch` is load-bearing: without it the panels take their
          natural heights and the grid reads as ragged. */}
      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        {/* 1 — are we even calling anyone? Qualifies every other panel. */}
        <Panel icon={<IconPhoneCall />} title="Coverage" note="the honesty metric">
          {d && d.coverage.pct !== null ? (
            <CoverageMeter
              pct={d.coverage.pct}
              contacted={d.coverage.contacted}
              followups={d.coverage.followups}
            />
          ) : (
            <Awaiting need="No delivered orders in this range, so there is nothing to have called." />
          )}
        </Panel>

        {/* 2 — where is the work? */}
        <Panel
          icon={<IconStack2 />}
          title="Where the queue stands"
          note="every follow-up in range"
        >
          {d && d.coverage.followups > 0 ? (
            <QueueBar
              parts={[
                {
                  key: "due",
                  label: "Waiting",
                  count: d.funnel.due,
                  color: CHART_COLOURS.due,
                },
                {
                  key: "prog",
                  label: "In progress",
                  count: d.funnel.inProgress,
                  color: CHART_COLOURS.progress,
                },
                {
                  key: "done",
                  label: "Completed",
                  count: d.funnel.completed,
                  color: CHART_COLOURS.done,
                },
                {
                  key: "unre",
                  label: "Unreachable",
                  count: d.funnel.unreachable,
                  color: CHART_COLOURS.unreachable,
                },
                {
                  key: "nreq",
                  label: "Not required",
                  count: d.funnel.notRequired,
                  color: CHART_COLOURS.notRequired,
                },
              ]}
            />
          ) : (
            <Awaiting need="No delivered orders in this range, so there is no queue to describe." />
          )}
        </Panel>

        {/* 3 — is our deadline honest? The one panel a bar cannot replace. */}
        <Panel
          icon={<IconScale />}
          title="Our deadline vs the customer"
          note="the disagreement is the finding"
        >
          {d && onTimeTotal > 0 ? (
            <OnTimeQuadrant data={d.onTime} />
          ) : (
            <Awaiting need="Needs completed calls where the customer answered the on-time question. This is the panel that tells you whether the deadlines in Settings are the promise you actually make." />
          )}
        </Panel>

        {/* 4 — what are we losing marks on? Maps straight to a department. */}
        <Panel
          icon={<IconStar />}
          title="Where the score is lost"
          note="average out of 5, worst first"
        >
          {d && d.ratings.subs.length > 0 ? (
            <CountBars
              tone="warning"
              outOf={5}
              rows={d.ratings.subs.map((x) => ({
                key: x.key,
                label: x.label,
                value: x.avg,
              }))}
            />
          ) : (
            <Awaiting need="Needs rated calls. The criteria come from Settings → CRM, so this follows whatever you decided to measure." />
          )}
        </Panel>

        {/* 5 — getting better or worse? */}
        <Panel
          icon={<IconTrendingUp />}
          title="Rating trend"
          note="monthly average of the overall score"
        >
          {d && d.ratings.trend.length > 1 ? (
            <RatingTrendLine trend={d.ratings.trend} />
          ) : (
            <Awaiting
              need={
                d && d.ratings.trend.length === 1
                  ? "One month of ratings so far — a trend needs two to compare."
                  : "Needs rated calls across two or more months."
              }
            />
          )}
        </Panel>

        {/* 6 — what is going wrong, sliced three ways in ONE panel. */}
        <Panel
          icon={<IconAlertTriangle />}
          title="What is going wrong"
          note={
            d && d.complaints.medianTatDays != null
              ? `${d.complaints.total} complaints · median ${d.complaints.medianTatDays}d to close`
              : d
                ? `${d.complaints.total} complaints · none closed yet`
                : undefined
          }
          aside={
            <Segmented
              size="sm"
              label="Group complaints by"
              value={slice}
              onChange={(v) => setSlice(v as typeof slice)}
              options={[
                { value: "category", label: "What" },
                { value: "dept", label: "Who fixes" },
                { value: "transport", label: "Transport" },
              ]}
            />
          }
        >
          {d && sliceRows.length > 0 ? (
            <CountBars rows={sliceRows} />
          ) : (
            <Awaiting
              need={
                d && d.complaints.total === 0
                  ? "No complaints recorded in this range. With coverage this low that means nobody asked, not that nobody complained."
                  : "No complaint in this range carries that detail."
              }
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
