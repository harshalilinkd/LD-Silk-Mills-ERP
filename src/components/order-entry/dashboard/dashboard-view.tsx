"use client";

// The Order Entry dashboard, rebuilt against the standalone app it was ported
// from (components/dashboard/dashboard-view.tsx): same sections in the same
// order, same deep-link intent, this repo's tokens and card patterns.
//
// It is a Client Component because three things here are interactive — the
// Orders/Value toggle on the trend chart, the recharts tooltips, and the
// refresh button. The DATA is still fetched on the server: the page above
// awaits loadDashboard() and hands the whole payload down as a prop, so the
// first paint has real numbers and changing the range is a server navigation,
// not a client fetch.
import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconBan,
  IconCircleCheck,
  IconClipboardList,
  IconCurrencyRupee,
  IconRoute,
  IconRuler2,
  IconTrash,
} from "@tabler/icons-react";

import type { DashboardData, Department } from "@/lib/order-entry/dashboard";
import { formatCount, formatDate, formatNumber } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { AnimatedNumber } from "@/components/ui/money";
import { StatCard, type StatTone } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
// One stage palette for the whole module: the pipeline rows deep-link INTO the
// order-status board, so the dot beside "Challan" here has to be the dot beside
// "Challan" there. Importing rather than re-declaring is what keeps that true.
import { STAGE_DOT } from "@/components/order-entry/order-status/status-style";
import { DashboardFilterBar } from "./filter-bar";
import { MonthlyReportTable } from "./monthly-report";
import { OnTimeGauge } from "./on-time-gauge";
import { cn } from "@/lib/utils";

// Recharts is by far the heaviest thing on this route and nothing above the
// charts needs it, so it loads on its own: the KPIs, pipeline and tables paint
// immediately and the charts fill in behind the same skeleton. `ssr: false`
// also keeps ResponsiveContainer from rendering a zero-width chart on the
// server only to remeasure on the client.
const chartsModule = () => import("./charts");
const ChartSkeleton = () => (
  <div className="h-[232px] animate-pulse rounded-lg bg-surface-2" />
);
const TrendChart = dynamic(() => chartsModule().then((m) => m.TrendChart), {
  ssr: false,
  loading: ChartSkeleton,
});
const StatusDonut = dynamic(() => chartsModule().then((m) => m.StatusDonut), {
  ssr: false,
  loading: ChartSkeleton,
});

/**
 * Percent change against the previous period of the same length (kpis.prev).
 * Ported from the source dashboard's `delta()`: a zero baseline cannot produce
 * a percentage, so `pct` is null when something appeared out of nothing (the
 * tile says so in words instead) and the whole thing is undefined when both
 * periods are empty and there is nothing to compare.
 */
function delta(
  cur: number,
  prev: number,
): { pct: number | null; note: string } | undefined {
  if (prev === 0) return cur > 0 ? { pct: null, note: "new this period" } : undefined;
  return {
    pct: Math.round(((cur - prev) / prev) * 100),
    note: "vs previous period",
  };
}

/**
 * A KPI tile — SCREENS.md §1.2B.
 *
 * The spec is specific about the parts: it is the shared `StatCard` primitive
 * (§0.4) whose value is an animated NumberFlow count-up at
 * `maximumFractionDigits: 0`, wrapped in a `Link`, and the LINK is what carries
 * `hover:-translate-y-0.5` — the lift belongs to the thing that navigates, not
 * to the card.
 *
 * `AnimatedNumber` rather than `Money` for the rupee tile: `Money` pins both
 * fraction digits at 2, and "₹12,48,300.00" at KPI size is two dead glyphs of
 * false precision. `AnimatedNumber` takes the prefix and honours §1.2B's
 * `maximumFractionDigits: 0`. Both come from the same file and both carry
 * `.num`, so the tabular figures that stop the roll from jittering are intact.
 *
 * The trend badge is StatCard's own: our `delta()` compares against the
 * previous period of the same length (`kpis.prev`), which the spec's tile does
 * not do at all. The zero-baseline "new" case has no percentage to render, so
 * it moves to `sub`, which is also where the "vs previous period" caption goes
 * — otherwise a bare ▲12% never says twelve percent of what.
 */
function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  prefix,
  suffix,
  href,
  trend,
}: {
  icon: typeof IconClipboardList;
  tone: StatTone;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  /** Every tile deep-links: a figure you cannot open is a dead end (§1.2B). */
  href: string;
  trend?: { pct: number | null; note: string };
}) {
  return (
    <Link
      href={href}
      title="View these orders"
      className="block rounded-card transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <StatCard
        className="h-full"
        icon={<Icon />}
        tone={tone}
        label={label}
        trend={trend?.pct ?? null}
        sub={trend?.note}
        value={
          <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
        }
      />
    </Link>
  );
}

function Panel({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[10px] border border-border bg-surface px-5 py-[18px]",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[14.5px] font-bold text-text-1">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Compact figure tile for the Cancellations / Trash panels. */
function MiniFig({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon?: typeof IconBan;
  label: string;
  value: number;
  tone?: "danger" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-3">
        {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1.5 num text-[24px] leading-none font-bold tracking-[-0.02em]",
          tone === "danger" ? "text-status-red" : "text-text-1",
        )}
      >
        {formatCount(value)}
      </div>
    </div>
  );
}

/** Ranked horizontal bars — the shape from crm/charts.tsx CountBars. */
function TopBars({
  rows,
  barClass,
  empty,
}: {
  rows: { key: string; label: string; value: number; sub: string; display: string }[];
  barClass: string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-text-3">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-text-1" title={r.label}>
              {r.label}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barClass)}
                style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="num text-[12.5px] font-semibold text-text-1">
              {r.display}
            </div>
            <div className="text-[10.5px] text-text-3">{r.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardView({
  data,
  today,
  department,
}: {
  data: DashboardData;
  today: string;
  department: Department;
}) {
  const [metric, setMetric] = useState<"orders" | "value">("orders");
  const { from, to } = data.range;
  const pipelineMax = Math.max(...data.pipeline.map((p) => p.count), 1);
  const pipelineEmpty = data.pipeline.every((p) => p.count === 0);

  // §1.3 — "Needs attention" must break ties DETERMINISTICALLY.
  //
  // The query orders overdue stages by `planned_at` ascending and nothing
  // else, so two stages planned for the same instant come back in whatever
  // order Postgres happened to emit rows — and the grid below quietly
  // reshuffles between loads. That is exactly the bug §1.3 says was fixed
  // once and is worth keeping fixed.
  //
  // The fix belongs in the ORDER BY, but src/lib is not ours to edit here, so
  // it is re-established client-side. Two properties make this a true tie-break
  // rather than a re-sort:
  //
  //  1. `daysOverdue` is a monotone function of `planned_at` (earlier plan =
  //     more days late), so the server's rows already arrive in descending
  //     `daysOverdue` order. The first comparator is therefore a no-op on
  //     well-ordered input.
  //  2. Array.prototype.sort is stable (ES2019), so the ONLY rows that move
  //     are those the server left ambiguous — the equal-`daysOverdue` runs,
  //     which is precisely where the ambiguity lives.
  //
  // `orderNo` is TEXT (§0.6.2) — `numeric: true` collates "ORD-9" before
  // "ORD-10" without ever parsing it as a number.
  //
  // What this cannot repair: the query's own LIMIT 10 picks its tenth row
  // before we see anything, so a tie straddling that boundary can still swap
  // WHICH card appears. Only an ORDER BY in dashboard-query.ts closes that.
  const attention = useMemo(
    () =>
      [...data.attention].sort(
        (a, b) =>
          b.daysOverdue - a.daysOverdue ||
          a.orderNo.localeCompare(b.orderNo, "en", { numeric: true }),
      ),
    [data.attention],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Order Entry
          </h1>
          <p className="mt-1 text-[13px] text-text-3">
            {formatDate(from)} – {formatDate(to)} ·{" "}
            {formatCount(data.kpis.orders)} order
            {data.kpis.orders === 1 ? "" : "s"} · {formatCount(data.kpis.activeOrders)}{" "}
            active · {formatCount(data.kpis.overdueStages)} overdue
          </p>
        </div>
      </div>

      <DashboardFilterBar
        from={from}
        to={to}
        today={today}
        department={department}
      />

      {/* KPI cards — % badges compare against the previous period of the
          same length (kpis.prev), which loadDashboard already computed. */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          icon={IconClipboardList}
          tone="accent"
          label="Total orders"
          value={data.kpis.orders}
          href="/order-entry/orders"
          trend={delta(data.kpis.orders, data.kpis.prev.orders)}
        />
        <Kpi
          icon={IconCurrencyRupee}
          tone="success"
          label="Order value"
          value={data.kpis.value}
          prefix="₹"
          href="/order-entry/orders"
          trend={delta(data.kpis.value, data.kpis.prev.value)}
        />
        <Kpi
          icon={IconRuler2}
          tone="warning"
          label="Meters"
          value={data.kpis.meters}
          suffix=" m"
          href="/order-entry/orders"
          trend={delta(data.kpis.meters, data.kpis.prev.meters)}
        />
        <Kpi
          icon={IconActivity}
          tone="accent"
          label="Active orders"
          value={data.kpis.activeOrders}
          href="/order-entry/order-status?overall=in_progress"
        />
        <Kpi
          icon={IconAlertTriangle}
          tone="danger"
          label="Overdue stages"
          value={data.kpis.overdueStages}
          href="/order-entry/order-status?overall=overdue"
        />
        <Kpi
          icon={IconCircleCheck}
          tone="success"
          label="On-time %"
          value={data.kpis.onTimePct}
          suffix="%"
          href="/order-entry/order-status"
        />
      </div>

      {/* Operations pipeline — where work is sitting right now (§1.2C).
          Every row deep-links to the stage it counts. §1.2C names /tracking,
          but our Operations index (components/order-entry/tracking/
          tracking-index.tsx) keeps its filters in component state and never
          reads useSearchParams — a ?stage= there would be a dead link. The
          order-status board DOES read it (order-status-board.tsx seeds its
          stage select from params.get("stage")), so that is where the intent
          "open the list filtered to this stage" actually lands today. */}
      <Panel
        title="Operations pipeline"
        action={
          <span className="text-[11px] text-text-3">
            lines awaiting each stage
          </span>
        }
      >
        {pipelineEmpty ? (
          <EmptyState icon={IconRoute} title="No active lines in the pipeline." />
        ) : (
          <div className="flex flex-col gap-1">
            {data.pipeline.map((p) => (
              <Link
                key={p.stageKey}
                href={`/order-entry/order-status?stage=${p.stageKey}`}
                title={`Show orders waiting at ${p.label}`}
                className="group -mx-2 flex items-center gap-3 rounded-field px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                {/* The dot is a SECOND signal, never the only one: the seven
                    stage hues sit close together under colour-blindness, so
                    §1.2C requires the stage NAME on every row as well. */}
                <span className="flex w-[104px] shrink-0 items-center gap-1.5 sm:w-[132px]">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      STAGE_DOT[p.stageKey] ?? "bg-text-3",
                    )}
                  />
                  <span className="truncate text-[13px] font-medium text-text-2 group-hover:text-text-1">
                    {p.label}
                  </span>
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-chip">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{
                      width:
                        p.count === 0
                          ? "0%"
                          : `${Math.max(6, (p.count / pipelineMax) * 100)}%`,
                    }}
                  />
                </span>
                <span className="num w-8 shrink-0 text-right text-[13px] font-semibold text-text-1">
                  {p.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* Charts */}
      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
        <Panel
          title="Order trend"
          className="md:col-span-2"
          action={
            <div className="flex gap-1">
              {(["orders", "value"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metric === m}
                  onClick={() => setMetric(m)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                    metric === m
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface-2 text-text-2 hover:text-text-1",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          }
        >
          <TrendChart data={data.trend} metric={metric} />
        </Panel>

        <Panel title="Order status split">
          <StatusDonut data={data.statusBreakdown} />
        </Panel>

        <Panel title="On-time delivery" bodyClassName="grid place-items-center py-2">
          <OnTimeGauge
            pct={data.kpis.onTimePct}
            onTime={data.delays.onTime}
            late={data.delays.late}
          />
        </Panel>
      </div>

      {/* Cancellations & Trash — the order/design lifecycle metrics. */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel
          title="Cancellations"
          action={<span className="text-[11px] text-text-3">this range</span>}
        >
          <div className="grid grid-cols-3 gap-2.5">
            <MiniFig
              icon={IconBan}
              tone="danger"
              label="Cancelled designs"
              value={data.cancellation.cancelledDesigns}
            />
            <MiniFig
              label="Orders affected"
              value={data.cancellation.ordersWithCancel}
            />
            <MiniFig
              label="Fully cancelled"
              value={data.cancellation.cancelledOrders}
            />
          </div>
        </Panel>

        <Panel
          title="Trash"
          action={
            <Link
              href="/order-entry/settings/trash"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-text hover:underline"
            >
              Open Trash <IconArrowRight className="size-3.5" />
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2.5">
            <MiniFig
              icon={IconTrash}
              label="Deleted designs"
              value={data.trash.deletedDesigns}
            />
            <MiniFig
              icon={IconTrash}
              label="Deleted orders"
              value={data.trash.deletedOrders}
            />
          </div>
        </Panel>
      </div>

      {/* Top lists */}
      <div className="grid gap-3.5 lg:grid-cols-3">
        <Panel title="Top parties">
          <TopBars
            rows={data.topParties.map((p) => ({
              key: p.party,
              label: p.party,
              value: p.value,
              sub: `${p.orders} order${p.orders === 1 ? "" : "s"}`,
              display: `₹${formatNumber(p.value)}`,
            }))}
            barClass="bg-primary"
            empty="No orders in this range."
          />
        </Panel>

        <Panel title="Top fabrics">
          <TopBars
            rows={data.topFabrics.map((f) => ({
              key: f.fabric,
              label: f.fabric,
              value: f.meters,
              sub: "meters",
              display: `${formatNumber(f.meters)} m`,
            }))}
            barClass="bg-status-green"
            empty="No fabrics in this range."
          />
        </Panel>

        <Panel
          title="Recent orders"
          action={
            <Link
              href="/order-entry/orders"
              className="text-[12px] font-medium text-accent-text hover:underline"
            >
              View all
            </Link>
          }
        >
          {data.recentOrders.length === 0 ? (
            <EmptyState icon={IconClipboardList} title="No orders in this range" />
          ) : (
            // §1.2F row: order no over `party · date`, then ₹value and the
            // badge. The badge is the point — "₹1,20,000" tells you nothing
            // about whether that order is still owed to anyone.
            <div className="-mx-2 flex flex-col">
              {data.recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/order-entry/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-field px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-text-1">
                      {o.orderNo}
                    </div>
                    <div className="truncate text-[11.5px] text-text-3">
                      {o.party} · {formatDate(o.orderDate)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num text-[12.5px] font-medium text-text-1">
                      ₹{formatNumber(o.value)}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Needs attention">
        {attention.length === 0 ? (
          <EmptyState
            icon={IconAlertTriangle}
            title="Nothing overdue — you're on track."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {attention.map((a) => (
              <Link
                key={`${a.orderId}-${a.stageLabel}`}
                href={`/order-entry/tracking/${a.orderId}`}
                // §1.2G: the hover tints toward DANGER, not toward a neutral
                // emphasis. Every card in this grid is something already late,
                // so the pointer landing on one should feel like the alarm it is.
                className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-status-red/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-text-1">
                    {a.orderNo}
                    <span className="font-normal text-text-3"> · {a.party}</span>
                  </div>
                  <div className="truncate text-[11.5px] text-text-3">
                    Stage: {a.stageLabel}
                  </div>
                </div>
                <span className="num shrink-0 rounded-pill bg-status-red-dim px-2 py-0.5 text-[10.5px] font-semibold text-status-red">
                  {a.daysOverdue}d overdue
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* Month-by-month history — also where the order book starts. */}
      <MonthlyReportTable from={from} to={to} department={department} />
    </div>
  );
}
