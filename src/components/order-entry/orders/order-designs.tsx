"use client";

// OrderDesignsPanel / OrderDesignsList — docs/SCREENS.md §3.6
//
// The designs behind one order, FETCHED ON DEMAND. The Orders list itself only
// carries per-order rollups (`line_count`, `cancelled_line_count`), so opening
// a row asks `GET /api/order-entry/orders/:id` for that order's lines. On
// demand is the whole point: a hundred-row page would otherwise pull a hundred
// design lists nobody looked at.
//
// It shares the `["order", id]` query key with everything else that reads one
// order, so the per-design writes in cancel-line-button.tsx refresh this panel
// (and the order detail page, and the tracking board) with one invalidation.
//
// Two shapes, one data source:
//   • `OrderDesignsPanel` — the table under an expanded desktop row.
//   • `OrderDesignsList`  — the same lines as stacked cards, for the mobile
//     quick-view dialog (§3.7), where a seven-column table cannot fit.

import { useQuery } from "@tanstack/react-query";

import { formatNumber, type OrderDetail } from "@/lib/order-entry/orders";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { DesignLineActions } from "@/components/order-entry/orders/cancel-line-button";
import { cn } from "@/lib/utils";

async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  const res = await fetch(`/api/order-entry/orders/${orderId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load designs.");
  return body.data as OrderDetail;
}

function useOrderDesigns(orderId: string) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrderDetail(orderId),
  });
}

/** A cancelled design is struck through wherever it appears (§0.6, §3.5). */
const STRUCK = "text-text-3 line-through";

const TH =
  "px-3 py-1.5 text-[11px] font-medium text-text-3 whitespace-nowrap";

export function OrderDesignsPanel({
  orderId,
  canEdit,
}: {
  orderId: string;
  canEdit: boolean;
}) {
  const detail = useOrderDesigns(orderId);
  const lines = detail.data?.lines ?? [];

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-[13px] text-text-3">
        <Spinner /> Loading designs…
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="px-6 py-4 text-[13px] text-status-red">
        {(detail.error as Error)?.message ?? "Failed to load designs."}
      </div>
    );
  }

  return (
    <div className="px-6 py-3">
      <div className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        Designs (<span className="num">{lines.length}</span>)
      </div>
      {/* `table-fixed` with explicit percentage widths, and the fabric name
          truncating: this nested table has to fit INSIDE the parent's scroll
          region rather than widening it. */}
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full table-fixed text-left text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(TH, "w-[26%]")}>Fabric</th>
              <th className={cn(TH, "w-[16%]")}>Design no</th>
              <th className={cn(TH, "w-[10%] text-right")}>Qty</th>
              <th className={cn(TH, "w-[10%] text-right")}>Rate</th>
              <th className={cn(TH, "w-[14%] text-right")}>Line total</th>
              <th className={cn(TH, "w-[14%]")}>Status</th>
              {canEdit && (
                <th className={cn(TH, "w-[10%] text-right")}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const struck = l.is_cancelled ? STRUCK : "";
              return (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td
                    className={cn("truncate px-3 py-2 text-text-1", struck)}
                    title={l.quality}
                  >
                    {l.quality}
                  </td>
                  <td
                    className={cn("num truncate px-3 py-2 text-text-1", struck)}
                    title={l.design_no}
                  >
                    {l.design_no}
                  </td>
                  <td className={cn("num px-3 py-2 text-right text-text-2", struck)}>
                    {formatNumber(Number(l.qty_mtr))}
                  </td>
                  <td className={cn("num px-3 py-2 text-right text-text-2", struck)}>
                    {l.rate == null ? "—" : formatNumber(Number(l.rate))}
                  </td>
                  <td className={cn("num px-3 py-2 text-right text-text-1", struck)}>
                    {l.line_total == null
                      ? "—"
                      : `₹${formatNumber(Number(l.line_total))}`}
                  </td>
                  <td className="px-3 py-2">
                    {/* The badge is never struck through — it is what says WHY
                        the rest of the row is. */}
                    <StatusBadge
                      status={l.is_cancelled ? "CANCELLED" : l.operations_status}
                    />
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <DesignLineActions
                        orderId={orderId}
                        lineId={l.id}
                        cancelled={l.is_cancelled}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 7 : 6}
                  className="px-3 py-4 text-center text-text-3"
                >
                  No designs on this order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-text-3">
        Cancel strikes a design through (reversible). Delete moves it to Trash
        (restorable). Deleting every design removes the order.
      </p>
    </div>
  );
}

/** The same lines as a stacked card list, for the mobile quick-view (§3.7). */
export function OrderDesignsList({
  orderId,
  canEdit,
}: {
  orderId: string;
  canEdit: boolean;
}) {
  const detail = useOrderDesigns(orderId);

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[13px] text-text-3">
        <Spinner /> Loading designs…
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="py-3 text-[13px] text-status-red">
        {(detail.error as Error)?.message ?? "Failed to load designs."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {detail.data.lines.map((l) => {
        const struck = l.is_cancelled ? STRUCK : "";
        return (
          <div
            key={l.id}
            className="flex items-center gap-2 rounded-field border border-border bg-surface p-2"
          >
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-[13px] font-medium text-text-1",
                  struck,
                )}
              >
                {l.quality} · {l.design_no}
              </div>
              <div className="num text-[12px] text-text-3">
                {formatNumber(Number(l.qty_mtr))} mtr
                {l.line_total == null
                  ? ""
                  : ` · ₹${formatNumber(Number(l.line_total))}`}
              </div>
            </div>
            <StatusBadge
              status={l.is_cancelled ? "CANCELLED" : l.operations_status}
            />
            {canEdit && (
              <DesignLineActions
                className="shrink-0"
                orderId={orderId}
                lineId={l.id}
                cancelled={l.is_cancelled}
              />
            )}
          </div>
        );
      })}
      {detail.data.lines.length === 0 && (
        <p className="py-2 text-[13px] text-text-3">
          No designs on this order.
        </p>
      )}
    </div>
  );
}
