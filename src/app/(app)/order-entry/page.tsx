import Link from "next/link";
import {
  IconClipboardList,
  IconCurrencyRupee,
  IconRuler2,
  IconAlertTriangle,
  IconActivity,
} from "@tabler/icons-react";
import { dashboardParams, loadDashboard } from "@/lib/order-entry/dashboard-query";
import { formatCount, formatNumber, formatDate } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";

function Kpi({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
}: {
  icon: typeof IconClipboardList;
  iconClass: string;
  value: string;
  label: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-[10px] border border-border bg-surface p-[18px] transition-colors hover:bg-surface-2">
      <div
        className={`mb-3.5 flex size-8 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon className="size-[18px]" />
      </div>
      <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-[3px] text-xs text-text-3">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function OrderEntryDashboardPage() {
  const params = dashboardParams({});
  const data = await loadDashboard(params);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Order Entry
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Last 30 days · {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <Kpi
          icon={IconClipboardList}
          iconClass="bg-accent text-primary"
          value={formatCount(data.kpis.orders)}
          label="Orders"
          href="/order-entry/orders"
        />
        <Kpi
          icon={IconCurrencyRupee}
          iconClass="bg-status-blue-dim text-status-blue"
          value={`₹${formatNumber(data.kpis.value)}`}
          label="Order value"
        />
        <Kpi
          icon={IconRuler2}
          iconClass="bg-status-purple-dim text-status-purple"
          value={`${formatNumber(data.kpis.meters)} m`}
          label="Meters"
        />
        <Kpi
          icon={IconActivity}
          iconClass="bg-status-green-dim text-status-green"
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
          icon={IconActivity}
          iconClass="bg-status-amber-dim text-status-amber"
          value={`${data.kpis.onTimePct}%`}
          label="On-time delivery"
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
          <h2 className="mb-4 text-[14.5px] font-bold text-text-1">
            Operations pipeline
          </h2>
          {data.pipeline.every((p) => p.count === 0) ? (
            <EmptyState icon={IconActivity} title="Nothing in progress" />
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.pipeline.map((p) => {
                const max = Math.max(...data.pipeline.map((x) => x.count), 1);
                return (
                  <div key={p.stageKey} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-[12.5px] text-text-2">
                      {p.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(p.count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[12px] text-text-3">
                      {p.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
          <h2 className="mb-4 text-[14.5px] font-bold text-text-1">
            Needs attention
          </h2>
          {data.attention.length === 0 ? (
            <EmptyState
              icon={IconAlertTriangle}
              title="Nothing overdue"
              description="Every in-progress stage is within its planned deadline."
            />
          ) : (
            <div className="flex flex-col">
              {data.attention.slice(0, 8).map((a) => (
                <Link
                  key={`${a.orderId}-${a.stageLabel}`}
                  href={`/order-entry/orders/${a.orderId}`}
                  className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0 hover:text-text-1"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-text-1">
                      {a.orderNo}
                    </div>
                    <div className="truncate text-[11.5px] text-text-3">
                      {a.party} · {a.stageLabel}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-status-red-dim px-2 py-0.5 text-[10.5px] font-semibold text-status-red">
                    {a.daysOverdue}d overdue
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14.5px] font-bold text-text-1">
            Recent orders
          </h2>
          <Link
            href="/order-entry/orders"
            className="text-[12px] font-medium text-accent-text hover:underline"
          >
            View all
          </Link>
        </div>
        {data.recentOrders.length === 0 ? (
          <EmptyState icon={IconClipboardList} title="No orders yet" />
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
      </div>
    </div>
  );
}
