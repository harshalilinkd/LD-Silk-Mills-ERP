"use client";

// Fetches the full filtered set (loadOrderStatus's `all=1` escape hatch,
// which returns every visible group unpaginated) and turns it into a CSV
// download client-side — the /api/order-entry/order-status route only ever
// returns JSON, so the CSV assembly has to happen here rather than on the
// server. Mirrors Order Entry's board exportCsv() column set.
import * as React from "react";
import { IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { STAGE_OPTIONS, type OrderStatusList } from "@/lib/order-entry/order-status";
import { formatDate } from "@/lib/order-entry/orders";

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

export function ExportCsvButton({
  queryString,
  disabled,
}: {
  queryString: string;
  disabled?: boolean;
}) {
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const qs = queryString ? `${queryString}&all=1` : "all=1";
      const res = await fetch(`/api/order-entry/order-status?${qs}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Export failed");
      const list = body.data as OrderStatusList;
      const lines = list.groups.flatMap((g) => g.lines);

      const header = [
        "Order no",
        "Party",
        "Fabric",
        "Design",
        "Mtr",
        "Sales",
        "OD date",
        ...STAGE_OPTIONS.map((s) => s.label),
        "Done",
        "Overall",
        "Cancelled",
      ];
      const rows = lines.map((r) => [
        r.orderNo,
        r.party,
        r.fabric,
        r.design,
        r.qtyMtr,
        r.salesPerson ?? "",
        r.odDate,
        ...r.stages.map((st) =>
          r.isCancelled
            ? "cancelled"
            : st.stageKey === "stock_checking"
              ? st.state === "done"
                ? "In stock"
                : st.stockStatus === "out_of_stock"
                  ? "Out of stock"
                  : "Pending"
              : st.state === "done"
                ? `Done ${st.date ? formatDate(st.date) : ""}`.trim()
                : st.state,
        ),
        `${r.doneCount}/${STAGE_OPTIONS.length}`,
        r.isCancelled ? "cancelled" : r.overall,
        r.isCancelled ? "Yes" : "No",
      ]);
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
      download(csv, `order-status-${new Date().toISOString().slice(0, 10)}.csv`);
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
