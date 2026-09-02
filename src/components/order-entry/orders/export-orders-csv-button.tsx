"use client";

// Fetches the whole filtered set from GET /api/order-entry/orders with its
// `all=1` escape hatch (unpaginated, capped server-side) and assembles the CSV
// in the browser — the route only ever returns JSON. Column set mirrors Order
// Entry's orders-dashboard exportCsv().
//
// The KPI `status` filter is applied here rather than sent along, because the
// API has no `status` param (the rollup is derived, not stored). Filtering the
// downloaded rows the same way the page does keeps the export equal to what's
// on screen.
import * as React from "react";
import { IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { OrdersList, OrderRow } from "@/lib/order-entry/orders";
import {
  isOrderStatusParam,
  matchesOrderStatusParam,
} from "@/components/order-entry/orders/order-status-filter";

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportOrdersCsvButton({
  queryString,
  status,
  disabled,
}: {
  queryString: string;
  status?: string;
  disabled?: boolean;
}) {
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const qs = queryString ? `${queryString}&all=1` : "all=1";
      const res = await fetch(`/api/order-entry/orders?${qs}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Export failed");
      const list = body.data as OrdersList;

      const rows: OrderRow[] = isOrderStatusParam(status)
        ? list.orders.filter((o) =>
            matchesOrderStatusParam(
              {
                status: o.operations_status,
                cancelledCount: o.cancelled_line_count,
              },
              status,
            ),
          )
        : list.orders;

      const header = [
        "Order no",
        "Date",
        "Party",
        "Haste",
        "Agent",
        "Fabrics",
        "Designs",
        "Cancelled",
        "Qty",
        "Total amount",
        "Challan",
        "Lot",
        "Status",
      ];
      const body_ = rows.map((o) => [
        o.order_no,
        o.order_date,
        o.party_name,
        o.haste ?? "",
        o.agent ?? "",
        o.fabrics.join(" | "),
        o.operations_status === "CANCELLED" ? o.total_line_count : o.line_count,
        o.cancelled_line_count,
        o.qty_total,
        o.grand_total,
        o.challan_no ?? "",
        o.lot_no ?? "",
        o.operations_status,
      ]);
      const csv = [header, ...body_]
        .map((row) => row.map(csvCell).join(","))
        .join("\n");
      download(csv, `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11.5px] text-status-red">{error}</span>}
      <Button
        variant="outline"
        size="sm"
        onClick={exportCsv}
        disabled={disabled || exporting}
      >
        <IconDownload className="size-3.5" />
        {exporting ? "Exporting…" : "Export CSV"}
      </Button>
    </div>
  );
}
