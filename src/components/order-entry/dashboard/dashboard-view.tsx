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
import { useState } from "react";
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
  IconTrendingDown,
  IconTrendingUp,
} from "@tabler/icons-react";

import type { DashboardData, Department } from "@/lib/order-entry/dashboard";
import { formatCount, formatDate, formatNumber } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
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
 * Ported from the source dashboard's `delta()`: a zero baseline can't produce
 * a percentage, so it reads "new" when something appeared out of nothing and
 * shows no badge at all when both periods are empty.
 */
function delta(
  cur: number,
  prev: number,
): { dir: "up" | "down"; text: string } | undefined {
  if (prev === 0) return cur > 0 ? { dir: "up", text: "new" } : undefined;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return {
    dir: pct >= 0 ? "up" : "down",
    text: `${pct >= 0 ? "+" : ""}${pct}%`,
  };
}

function Kpi({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
  trend,
}: {
  icon: typeof IconClipboardList;
  iconClass: string;
  value: string;
  label: string;
  href?: string;
  trend?: { dir: "up" | "down"; text: string };
}) {
  const inner = (
    <div className="h-full rounded-[10px] border border-border bg-surface p-[18px] transition-colors hover:bg-surface-2">
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <div
          className={`flex size-8 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="size-[18px]" />
        </div>
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
              trend.dir === "up"
                ? "bg-status-green-dim text-status-green"
                : "bg-status-red-dim text-status-red",
            )}
            title="vs the previous period of the same length"
          >
            {trend.dir === "up" ? (
              <IconTrendingUp className="size-3" />
            ) : (
              <IconTrendingDown className="size-3" />
            )}
            {trend.text}
          </span>
        ) : null}
      </div>
      <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-[3px] text-xs text-text-3">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
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
          "mt-1.5 font-mono text-[24px] leading-none font-bold tracking-[-0.02em]",
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
            <div className="font-mono text-[12.5px] font-semibold text-text-1">
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
          iconClass="bg-accent text-accent-text"
          value={formatCount(data.kpis.orders)}
          label="Total orders"
          href="/order-entry/orders"
          trend={delta(data.kpis.orders, data.kpis.prev.orders)}
        />
        <Kpi
          icon={IconCurrencyRupee}
          iconClass="bg-status-blue-dim text-status-blue"
          value={`₹${formatNumber(data.kpis.value)}`}
          label="Order value"
          href="/order-entry/orders"
          trend={delta(data.kpis.value, data.kpis.prev.value)}
        />
        <Kpi
          icon={IconRuler2}
          iconClass="bg-status-purple-dim text-status-purple"
          value={`${formatNumber(data.kpis.meters)} m`}
          label="Meters"
          href="/order-entry/orders"
          trend={delta(data.kpis.meters, data.kpis.prev.meters)}
        />
        <Kpi
          icon={IconActivity}
          iconClass="bg-chip text-text-2"
          value={formatCount(data.kpis.activeOrders)}
          label="Active orders"
          href="/order-entry/order-status?overall=in_progress"
        />
        <Kpi
          icon={IconAlertTriangle}
          iconClass="bg-status-red-dim text-status-red"
          value={formatCount(data.kpis.overdueStages)}
          label="Overdue stages"
          href="/order-entry/order-status?overall=overdue"
        />
        <Kpi
          icon={IconCircleCheck}
          iconClass="bg-status-green-dim text-status-green"
          value={`${data.kpis.onTimePct}%`}
          label="On-time delivery"
          href="/order-entry/order-status"
        />
      </div>

      {/* Operations pipeline — where work is sitting right now. Every row
          deep-links to the order-status board filtered to that stage. */}
      <Panel
        title="Operations pipeline"
        action={
          <span className="text-[11px] text-text-3">
            lines awaiting each stage
          </span>
        }
      >
        {pipelineEmpty ? (
          <EmptyState
            icon={IconRoute}
            title="Nothing in progress"
            description="No active lines are waiting at any stage in this range."
          />
        ) : (
          <div className="flex flex-col gap-1">
            {data.pipeline.map((p) => (
              <Link
                key={p.stageKey}
                href={`/order-entry/order-status?stage=${p.stageKey}`}
                title={`Show orders waiting at ${p.label}`}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                <span className="w-28 shrink-0 truncate text-[12.5px] text-text-2 group-hover:text-text-1 sm:w-32">
                  {p.label}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
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
                <span className="w-8 shrink-0 text-right font-mono text-[12px] font-semibold text-text-1">
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
            <div className="flex flex-col">
              {data.recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/order-entry/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-text-1">
                      {o.orderNo}
                    </div>
                    <div className="truncate text-[11.5px] text-text-3">
                      {o.party} · {formatDate(o.orderDate)}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[12.5px] text-text-2">
                    ₹{formatNumber(o.value)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Needs attention">
        {data.attention.length === 0 ? (
          <EmptyState
            icon={IconAlertTriangle}
            title="Nothing overdue"
            description="Every in-progress stage is within its planned deadline."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.attention.map((a) => (
              <Link
                key={`${a.orderId}-${a.stageLabel}`}
                href={`/order-entry/tracking/${a.orderId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong"
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
                <span className="shrink-0 rounded-full bg-status-red-dim px-2 py-0.5 font-mono text-[10.5px] font-semibold text-status-red">
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
