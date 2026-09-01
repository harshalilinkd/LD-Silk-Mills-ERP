import Link from "next/link";
import { IconRoute } from "@tabler/icons-react";
import { loadOrderStatus } from "@/lib/order-entry/order-status-query";
import { formatDate } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";

const OVERALL_STYLE: Record<string, string> = {
  completed: "bg-status-green-dim text-status-green",
  in_progress: "bg-status-blue-dim text-status-blue",
  overdue: "bg-status-red-dim text-status-red",
};

export default async function OrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.overall) params.set("overall", sp.overall);
  const data = await loadOrderStatus(params);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Order status
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          {data.summary.total} orders · {data.summary.inProgress} in progress ·{" "}
          {data.summary.overdue} overdue · {data.summary.completed} completed
        </p>
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        {data.groups.length === 0 ? (
          <EmptyState icon={IconRoute} title="No orders match this view" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Order no", "Party", "Date", "Progress", "Current stage", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {data.groups.map((g) => (
                  <tr key={g.orderId}>
                    <td className="border-b border-border px-3.5 py-3">
                      <Link
                        href={`/order-entry/orders/${g.orderId}`}
                        className="font-mono font-semibold text-accent-text hover:underline"
                      >
                        {g.orderNo}
                      </Link>
                    </td>
                    <td className="border-b border-border px-3.5 py-3 text-text-1">
                      {g.party}
                    </td>
                    <td className="border-b border-border px-3.5 py-3 text-text-2">
                      {formatDate(g.odDate)}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${(g.doneCount / (g.stages.length || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[11.5px] text-text-3">
                          {g.doneCount}/{g.stages.length}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-border px-3.5 py-3 text-text-2">
                      {g.isCancelled
                        ? "—"
                        : (g.stages.find((s) => s.stageKey === g.currentStageKey)
                            ?.label ?? "—")}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                          g.isCancelled
                            ? "bg-white/5 text-text-3"
                            : OVERALL_STYLE[g.overall]
                        }`}
                      >
                        {g.isCancelled ? "Cancelled" : g.overall.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
