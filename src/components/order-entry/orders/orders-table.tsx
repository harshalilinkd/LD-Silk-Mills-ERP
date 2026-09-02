"use client";

// The orders list table. Rendered from the Server Component page with data it
// already has — this component exists purely for the two interactive bits the
// old Order Entry dashboard had and a server-rendered table can't do on its
// own: expanding a row to reveal its designs, and the per-row action cluster.
import { Fragment, useState } from "react";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import type { OperationsStatus } from "@/lib/order-entry/orders";
import {
  OPERATIONS_LABEL,
  OPERATIONS_TONE,
} from "@/components/order-entry/tracking/status-style";
import { OrderRowActions } from "@/components/order-entry/orders/order-row-actions";
import { cn } from "@/lib/utils";

export type OrdersTableDesign = {
  id: string;
  quality: string;
  designNo: string;
  qtyMtr: number;
  lineTotal: number;
  isCancelled: boolean;
};

export type OrdersTableRow = {
  id: string;
  orderNo: string;
  orderDate: string;
  partyName: string;
  haste: string | null;
  agent: string | null;
  challanNo: string | null;
  lotNo: string | null;
  fabrics: string[];
  /** Live designs — or every design once the whole order is cancelled. */
  designCount: number;
  cancelledCount: number;
  qtyTotal: number;
  grandTotal: number;
  status: OperationsStatus;
  designs: OrdersTableDesign[];
};

const COLUMNS = [
  "Order no",
  "Date",
  "Party",
  "Haste",
  "Agent",
  "Fabrics",
  "Designs",
  "Qty (m)",
  "Value",
  "Challan",
  "Lot",
  "Status",
  "Actions",
];

const TD = "border-b border-border px-3.5 py-3";

export function OrdersTable({ rows }: { rows: OrdersTableRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1240px] border-collapse text-[13px]">
        <thead>
          <tr>
            {COLUMNS.map((h) => (
              <th
                key={h}
                className={cn(
                  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3",
                  h === "Actions" && "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {rows.map((r) => {
            const cancelled = r.status === "CANCELLED";
            const isOpen = expanded.has(r.id);
            const fabricLabel =
              r.fabrics.length > 2
                ? `${r.fabrics.slice(0, 2).join(", ")} +${r.fabrics.length - 2}`
                : r.fabrics.join(", ") || "—";
            return (
              <Fragment key={r.id}>
                <tr className={cn("hover:bg-surface-2", cancelled && "opacity-60")}>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        aria-expanded={isOpen}
                        aria-label={
                          isOpen
                            ? `Collapse ${r.orderNo}`
                            : `Show designs on ${r.orderNo}`
                        }
                        className="-m-1 rounded p-1 text-text-3 transition-colors hover:bg-surface-3 hover:text-text-1"
                      >
                        <IconChevronRight
                          className={cn(
                            "size-4 transition-transform",
                            isOpen && "rotate-90",
                          )}
                        />
                      </button>
                      <Link
                        href={`/order-entry/orders/${r.id}`}
                        className="font-mono font-semibold text-accent-text hover:underline"
                      >
                        {r.orderNo}
                      </Link>
                    </div>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-text-2")}>
                    {formatDate(r.orderDate)}
                  </td>
                  <td
                    className={cn(TD, "max-w-[220px] truncate text-text-1")}
                    title={r.partyName}
                  >
                    {r.partyName}
                  </td>
                  <td className={cn(TD, "text-text-2")}>{r.haste ?? "—"}</td>
                  <td className={cn(TD, "text-text-2")}>{r.agent ?? "—"}</td>
                  <td
                    className={cn(TD, "max-w-[200px] truncate text-text-2")}
                    title={r.fabrics.join(", ")}
                  >
                    {fabricLabel}
                  </td>
                  <td className={cn(TD, "font-mono text-text-2")}>
                    {r.designCount}
                    {!cancelled && r.cancelledCount > 0 && (
                      <span
                        className="ml-1 font-sans text-[10.5px] text-status-red"
                        title={`${r.cancelledCount} cancelled`}
                      >
                        +{r.cancelledCount} cancelled
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, "font-mono text-text-2")}>
                    {formatNumber(r.qtyTotal)}
                  </td>
                  <td className={cn(TD, "font-mono text-text-1")}>
                    ₹{formatNumber(r.grandTotal)}
                  </td>
                  <td className={cn(TD, "font-mono text-text-2")}>
                    {r.challanNo ?? "—"}
                  </td>
                  <td className={cn(TD, "font-mono text-text-2")}>
                    {r.lotNo ?? "—"}
                  </td>
                  <td className={TD}>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
                        OPERATIONS_TONE[r.status],
                      )}
                    >
                      {OPERATIONS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className={TD}>
                    <OrderRowActions
                      orderId={r.id}
                      orderNo={r.orderNo}
                      cancelled={cancelled}
                    />
                  </td>
                </tr>

                {isOpen && (
                  <tr className="bg-surface-2/60">
                    <td className="border-b border-border px-3.5 py-3" colSpan={COLUMNS.length}>
                      {r.designs.length === 0 ? (
                        <p className="text-[12.5px] text-text-3">
                          No designs on this order.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[11px] uppercase tracking-[0.04em] text-text-3">
                            {r.designs.length} design
                            {r.designs.length === 1 ? "" : "s"}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.designs.map((d) => (
                              <span
                                key={d.id}
                                className={cn(
                                  "flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text-2",
                                  d.isCancelled && "opacity-60",
                                )}
                              >
                                <span className="text-text-3">{d.quality}</span>
                                <span
                                  className={cn(
                                    "font-mono font-semibold text-text-1",
                                    d.isCancelled && "line-through",
                                  )}
                                >
                                  {d.designNo}
                                </span>
                                <span className="font-mono">
                                  {formatNumber(d.qtyMtr)} m
                                </span>
                                <span className="font-mono text-text-1">
                                  ₹{formatNumber(d.lineTotal)}
                                </span>
                                {d.isCancelled && (
                                  <span className="text-[10.5px] text-status-red">
                                    cancelled
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
