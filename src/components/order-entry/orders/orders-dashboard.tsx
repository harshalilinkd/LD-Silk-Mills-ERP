"use client";

// OrdersDashboard — docs/SCREENS.md §3.2 – §3.11
//
// The table half of the Orders screen: five KPI cards that are also filters, a
// toolbar, a thirteen-column table on desktop, a card list + quick-view dialog
// on mobile, and the two order-level confirm dialogs.
//
// ── The one decision everything else follows (§3.2) ────────────────────────
// **The list fetches the ENTIRE matching set** (`all=1`). Search and the column
// filters are applied SERVER-side; the KPI status filter and pagination are
// applied CLIENT-side. That split is the point: the KPI cards have to show
// accurate all-orders counts *and* act as one-click filters, which is
// impossible if the client only ever holds one page of twenty. `placeholderData`
// keeps the old rows on screen while a new filter loads, so the table never
// flashes empty.
//
// Search applies on ENTER (it is a <form>), not per keystroke — a full-set
// refetch on every character is not a search box, it is a denial of service.
// The column filters, which fire on every keystroke inside OrderFilters, are
// debounced 300ms here instead.

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconChevronRight,
  IconCircleX,
  IconClipboardList,
  IconClock,
  IconDownload,
  IconEdit,
  IconEye,
  IconListCheck,
  IconPlus,
  IconRefresh,
  IconRotateClockwise,
  IconRoute,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";

import {
  formatNumber,
  type OrderRow,
  type OrdersList,
} from "@/lib/order-entry/orders";
import { monthOf } from "@/lib/order-entry/months";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HScroll } from "@/components/ui/hscroll";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Reveal } from "@/components/ui/reveal";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, Th, Tr } from "@/components/ui/data-table";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import {
  appendOrderFilterParams,
  EMPTY_ORDER_FILTERS,
  hasActiveOrderFilters,
  OrderFilters,
  type MonthOption,
  type OrderFilterState,
} from "@/components/order-entry/shared/order-filters";
import {
  csvFilename,
  download,
  toCsv,
} from "@/components/order-entry/shared/csv";
import {
  OrderDesignsList,
  OrderDesignsPanel,
} from "@/components/order-entry/orders/order-designs";
import { cn } from "@/lib/utils";

// The KPI cards double as one-click status filters. "" = show all.
type StatusFilter =
  | ""
  | "COMPLETED"
  | "PARTIALLY COMPLETED"
  | "PENDING"
  | "cancelled";

const PAGE_SIZE = 20;

// There is no toast in this shell, so the screen carries a one-line notice.
// It is where the two confirm dialogs put their outcome: §3.10 has both
// dialogs close on error as well as success, and closing a dialog over a
// silent failure is how a delete that did not happen looks exactly like one
// that did.
type Notice = { tone: "error" | "success"; text: string } | null;

async function fetchOrders(qs: string): Promise<OrdersList> {
  const res = await fetch(`/api/order-entry/orders?${qs}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load orders.");
  return body.data as OrdersList;
}

async function patchOrder(path: string, payload: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "The write failed.");
  }
}

export function OrdersDashboard({
  canEdit,
  canTrack,
}: {
  /** `orders.edit` (or ADMIN), resolved on the server from the session. */
  canEdit: boolean;
  /** `operations.view` — gates the Track action only. */
  canTrack: boolean;
}) {
  const queryClient = useQueryClient();

  // Typed vs SUBMITTED. Only `search` reaches the query key.
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);
  const [filters, setFilters] =
    React.useState<OrderFilterState>(EMPTY_ORDER_FILTERS);
  const [exporting, setExporting] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [toDelete, setToDelete] = React.useState<OrderRow | null>(null);
  const [toCancel, setToCancel] = React.useState<OrderRow | null>(null);
  const [selected, setSelected] = React.useState<OrderRow | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("");

  const debouncedFilters = useDebouncedValue(filters, 300);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // One builder for the list AND the export, so the CSV can never describe a
  // different set of orders than the table above it.
  const buildParams = React.useCallback(
    (extra?: Record<string, string>) => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      appendOrderFilterParams(p, debouncedFilters);
      for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
      return p.toString();
    },
    [search, debouncedFilters],
  );

  const list = useQuery({
    queryKey: ["orders", { search, filters: debouncedFilters }],
    queryFn: () => fetchOrders(buildParams({ all: "1" })),
    // No flash to an empty table while a new filter lands.
    placeholderData: (prev) => prev,
  });

  // A filter that leaves four results while you are on page 7 shows an empty
  // table, so every one of the three resets the page.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedFilters, search, statusFilter]);

  const data = list.data;
  const rows = React.useMemo(() => data?.orders ?? [], [data]);

  // ── Month options for the filter panel's shortcut ─────────────────────────
  // Derived from the fetched set, but ONLY while no date range is active —
  // otherwise picking "Aug 2026" would narrow the set to August and leave
  // August as the single option, making the shortcut a one-way door.
  const [monthOptions, setMonthOptions] = React.useState<MonthOption[]>([]);
  const dateFiltered = Boolean(debouncedFilters.from || debouncedFilters.to);
  React.useEffect(() => {
    if (dateFiltered) return;
    const counts = new Map<string, number>();
    for (const o of rows) {
      const key = monthOf(o.order_date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const next: MonthOption[] = [...counts.entries()]
      // Newest first.
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, count]) => ({ key, count }));
    setMonthOptions((prev) =>
      prev.length === next.length &&
      prev.every((m, i) => m.key === next[i].key && m.count === next[i].count)
        ? prev
        : next,
    );
  }, [rows, dateFiltered]);

  // ── Writes (§3.10) ────────────────────────────────────────────────────────
  // Both invalidate every key an order touches: it is on this list, on Order
  // status, in the tracker and on its own board at the same time.
  const invalidateOrder = React.useCallback(
    (id: string) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order", id] });
      void queryClient.invalidateQueries({ queryKey: ["order-status"] });
      void queryClient.invalidateQueries({ queryKey: ["order-tracker"] });
      void queryClient.invalidateQueries({ queryKey: ["tracking", id] });
      void queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
    [queryClient],
  );

  // The trash icon is a SOFT delete: every design moves to Trash, keeps its
  // stage progress and can be restored. Permanent purge lives on Trash only.
  const del = useMutation({
    mutationFn: (o: OrderRow) =>
      patchOrder(`/api/order-entry/orders/${o.id}/delete`, {
        line_id: null,
        deleted: true,
      }),
    onSuccess: (_res, o) => {
      setNotice({
        tone: "success",
        text: `Order ${o.order_no} deleted — moved to Trash.`,
      });
      setToDelete(null);
      setSelected(null);
      invalidateOrder(o.id);
    },
    onError: (err: Error) => {
      setNotice({ tone: "error", text: err.message });
      setToDelete(null);
    },
  });

  // Whole-order cancel / restore (it flips every design line). Restore is
  // immediate; cancel goes through the confirm dialog.
  const cancelOrder = useMutation({
    mutationFn: (v: { order: OrderRow; cancelled: boolean }) =>
      patchOrder(`/api/order-entry/orders/${v.order.id}/cancel`, {
        line_id: null,
        cancelled: v.cancelled,
      }),
    onSuccess: (_res, v) => {
      setNotice({
        tone: "success",
        text: v.cancelled ? "Order cancelled." : "Order restored.",
      });
      setToCancel(null);
      setSelected(null);
      invalidateOrder(v.order.id);
    },
    onError: (err: Error) => {
      setNotice({ tone: "error", text: err.message });
      setToCancel(null);
    },
  });

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  // The export re-fetches with the same params rather than writing the twenty
  // rows in hand — the file must carry the whole filtered set.
  //
  // ONE ROW PER DESIGN LINE, not per order. DSGN-MATCHING and MTR-YARD only
  // exist at the line level — a 34-design order has 34 of each — so an
  // order-level row can't carry them without either picking one line
  // arbitrarily or gluing all 34 into one cell. Every order-level column
  // (party, haste, agent, challan…) repeats on each of that order's rows,
  // which is the flat shape the old AppSheet export used and the shape a
  // spreadsheet can actually pivot or filter on.
  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const all = await fetchOrders(buildParams({ all: "1" }));
      const csv = toCsv([
        [
          "Order no",
          "Date",
          "Timestamp",
          "Party",
          "Haste",
          "Agent",
          "Sales person",
          "Quality",
          "DSGN-MATCHING",
          "MTR-YARD",
          "Rate",
          "Line total",
          "Cancelled",
          "Challan",
          "Lot",
          "Order status",
        ],
        ...all.orders.flatMap((o) =>
          o.lines.map((l) => [
            o.order_no,
            o.order_date,
            l.created_at,
            o.party_name,
            o.haste ?? "",
            o.agent ?? "",
            o.sales_person ?? "",
            l.quality,
            l.design_no,
            l.qty_mtr,
            l.rate ?? "",
            l.line_total ?? "",
            l.is_cancelled ? "Yes" : "No",
            o.challan_no ?? "",
            o.lot_no ?? "",
            o.operations_status,
          ]),
        ),
      ]);
      download(csv, csvFilename("orders"));
      const lineCount = all.orders.reduce((s, o) => s + o.lines.length, 0);
      setNotice({
        tone: "success",
        text: `Exported ${lineCount} design line${lineCount === 1 ? "" : "s"} across ${all.orders.length} order${all.orders.length === 1 ? "" : "s"}.`,
      });
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Export failed.",
      });
    } finally {
      setExporting(false);
    }
  }

  // Keep the mobile popup's frozen `selected` snapshot in sync with the live
  // list after an inline per-design cancel/delete, and close it if the order
  // has vanished (its last design was deleted → the whole order went to Trash).
  // Without this, cancelling a design inside the popup left a stale header.
  React.useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((r) => r.id === selected.id);
    if (fresh) {
      if (fresh !== selected) setSelected(fresh);
    } else if (!list.isFetching) {
      setSelected(null);
    }
  }, [rows, selected, list.isFetching]);

  // All-orders KPI counts, over the FULL fetched set — never the page.
  const kpi = React.useMemo(
    () => ({
      total: rows.length,
      completed: rows.filter((r) => r.operations_status === "COMPLETED").length,
      inProgress: rows.filter(
        (r) => r.operations_status === "PARTIALLY COMPLETED",
      ).length,
      pending: rows.filter((r) => r.operations_status === "PENDING").length,
      // DESIGNS, not orders — an order can lose one design without being
      // cancelled itself. The sub-label counts the orders they sit in.
      cancelledDesigns: rows.reduce((s, r) => s + r.cancelled_line_count, 0),
      ordersWithCancel: rows.filter((r) => r.cancelled_line_count > 0).length,
    }),
    [rows],
  );

  const visibleRows = React.useMemo(() => {
    switch (statusFilter) {
      case "":
        return rows;
      case "cancelled":
        return rows.filter((r) => r.cancelled_line_count > 0);
      default:
        return rows.filter((r) => r.operations_status === statusFilter);
    }
  }, [rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  // CLAMPED, not reset: a filter that shrinks the set must not blank the table
  // in the render before the page-reset effect fires.
  const safePage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const kpiValue = (n: number) => (data ? String(n) : "—");

  return (
    <div className="flex flex-col gap-4">
      {/* Region A — KPI cards. Every one of them is a filter. */}
      <Reveal index={0}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            tone="accent"
            icon={<IconClipboardList />}
            label="Total orders"
            value={kpiValue(kpi.total)}
            sub="Show all"
            active={statusFilter === ""}
            onClick={() => setStatusFilter("")}
          />
          <StatCard
            tone="success"
            icon={<IconCheck />}
            label="Completed"
            value={kpiValue(kpi.completed)}
            sub="Tap to filter"
            active={statusFilter === "COMPLETED"}
            onClick={() => setStatusFilter("COMPLETED")}
          />
          <StatCard
            tone="warning"
            icon={<IconListCheck />}
            label="In progress"
            value={kpiValue(kpi.inProgress)}
            sub="Tap to filter"
            active={statusFilter === "PARTIALLY COMPLETED"}
            onClick={() => setStatusFilter("PARTIALLY COMPLETED")}
          />
          <StatCard
            tone="neutral"
            icon={<IconClock />}
            label="Pending"
            value={kpiValue(kpi.pending)}
            sub="Tap to filter"
            active={statusFilter === "PENDING"}
            onClick={() => setStatusFilter("PENDING")}
          />
          <StatCard
            tone="danger"
            icon={<IconCircleX />}
            label="Cancelled"
            value={kpiValue(kpi.cancelledDesigns)}
            sub={
              data
                ? `in ${kpi.ordersWithCancel} order${kpi.ordersWithCancel === 1 ? "" : "s"}`
                : undefined
            }
            active={statusFilter === "cancelled"}
            onClick={() => setStatusFilter("cancelled")}
          />
        </div>
      </Reveal>

      {/* Region B — toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* A <form>: the search applies on Enter, not per keystroke. */}
          <form onSubmit={applySearch} className="relative w-full sm:flex-1">
            <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order no, party, challan, lot…"
              aria-label="Search orders"
              className="h-9 pl-8 text-[13px]"
            />
          </form>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((s) => !s)}
              aria-pressed={showFilters}
            >
              <IconAdjustmentsHorizontal className="size-3.5" /> Filters
              {hasActiveOrderFilters(debouncedFilters) ? (
                <span className="ml-1 size-1.5 rounded-full bg-primary" />
              ) : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
            >
              {list.isFetching ? (
                <Spinner className="size-3.5" />
              ) : (
                <IconRefresh className="size-3.5" />
              )}{" "}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportCsv()}
              disabled={exporting || rows.length === 0}
            >
              {exporting ? (
                <Spinner className="size-3.5" />
              ) : (
                <IconDownload className="size-3.5" />
              )}{" "}
              Export
            </Button>
            {canEdit ? (
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/order-entry/orders/new" />}
              >
                <IconPlus className="size-3.5" /> New order
              </Button>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <OrderFilters
            value={filters}
            onChange={setFilters}
            months={monthOptions}
          />
        ) : null}

        {notice ? (
          <div
            className={cn(
              "flex items-start gap-2 rounded-field border px-3 py-2 text-[12.5px]",
              notice.tone === "error"
                ? "border-status-red/30 bg-status-red-dim text-status-red"
                : "border-status-green/30 bg-status-green-dim text-status-green",
            )}
          >
            {notice.tone === "error" ? (
              <IconAlertTriangle className="mt-[1px] size-4 shrink-0" />
            ) : (
              <IconCheck className="mt-[1px] size-4 shrink-0" />
            )}
            <span className="flex-1">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      {/* Region C — the three states, then the table */}
      {list.isLoading ? (
        <Card size="sm" className="py-0">
          <div className="flex items-center gap-2 px-4 py-10 text-[13px] text-text-2">
            <Spinner /> Loading orders…
          </div>
        </Card>
      ) : list.isError ? (
        <Card size="sm" className="py-0">
          <div className="px-4 py-10 text-[13px] text-status-red">
            {(list.error as Error)?.message ?? "Failed to load orders."}
          </div>
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card size="sm" className="py-0">
          <div className="px-4 py-10 text-center text-[13px] text-text-2">
            {statusFilter
              ? "No orders match this filter."
              : `No orders found${search ? ` for “${search}”` : ""}.`}
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile: one tappable card per order (§3.7) */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {pageRows.map((o) => (
              <OrderCard key={o.id} o={o} onOpen={() => setSelected(o)} />
            ))}
          </div>

          {/* Desktop: the full thirteen-column table (§3.5).
              min-w-[1240px] because thirteen columns do not fit; the bounded
              body height keeps the horizontal scrollbar on screen instead of
              stranding it below two hundred rows; and HScroll puts a second
              scrollbar ABOVE the header where the columns actually are. */}
          <Reveal index={1}>
            <Card size="sm" className="hidden py-0 lg:block">
              <HScroll bodyClassName="max-h-[calc(100vh-19rem)] overflow-auto">
                <Table className="min-w-[1240px]">
                  <THead>
                    <tr>
                      {/* Pinned both ways: the header never scrolls off the
                          top, the order number never scrolls off the left. */}
                      <Th className="sticky left-0 z-10 bg-surface">Order no</Th>
                      <Th>Date</Th>
                      <Th>Party</Th>
                      <Th>Haste</Th>
                      <Th>Agent</Th>
                      <Th>Fabrics</Th>
                      <Th className="text-right">Designs</Th>
                      <Th className="text-right">Total Qty</Th>
                      <Th className="text-right">Total Amount</Th>
                      <Th>Challan</Th>
                      <Th>Lot</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {pageRows.map((o) => {
                      const cancelled = o.operations_status === "CANCELLED";
                      // Every data cell EXCEPT Status and Actions. The badge
                      // is what says why the row is grey, and the buttons have
                      // to stay usable — that is how you restore it.
                      const struck = cancelled
                        ? "text-text-3 line-through"
                        : "";
                      const isOpen = expanded.has(o.id);
                      return (
                        <React.Fragment key={o.id}>
                          <Tr className="transition-colors">
                            <Td
                              className={cn(
                                // The sticky cell repeats the row hover: without
                                // it the pinned column keeps its resting
                                // background and the row appears to break in two.
                                "sticky left-0 z-10 bg-surface font-medium group-hover:bg-surface-2",
                                struck,
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(o.id)}
                                  aria-expanded={isOpen}
                                  aria-label={
                                    isOpen
                                      ? `Collapse ${o.order_no}`
                                      : `Expand ${o.order_no} designs`
                                  }
                                  className="-m-1 rounded p-1 text-text-3 transition-colors hover:bg-chip hover:text-text-1 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                                >
                                  <IconChevronRight
                                    className={cn(
                                      "size-4 shrink-0 transition-transform",
                                      isOpen && "rotate-90",
                                    )}
                                  />
                                </button>
                                <Link
                                  href={`/order-entry/orders/${o.id}`}
                                  className="num hover:text-accent-text hover:underline"
                                >
                                  {o.order_no}
                                </Link>
                              </div>
                            </Td>
                            <Td className={cn("num text-text-1", struck)}>
                              {o.order_date}
                            </Td>
                            <Td
                              className={cn(
                                "max-w-[220px] truncate text-text-1",
                                struck,
                              )}
                              title={o.party_name}
                            >
                              {o.party_name}
                            </Td>
                            <Td
                              className={cn(
                                "max-w-[140px] truncate text-text-2",
                                struck,
                              )}
                              title={o.haste ?? undefined}
                            >
                              {o.haste ?? "—"}
                            </Td>
                            <Td
                              className={cn(
                                "max-w-[140px] truncate text-text-2",
                                struck,
                              )}
                              title={o.agent ?? undefined}
                            >
                              {o.agent ?? "—"}
                            </Td>
                            <Td
                              className={cn(
                                "max-w-[200px] truncate text-text-1",
                                struck,
                              )}
                              title={o.fabrics.join(", ")}
                            >
                              {o.fabrics.length ? o.fabrics.join(", ") : "—"}
                            </Td>
                            <Td className={cn("num text-right text-text-2", struck)}>
                              {cancelled ? o.total_line_count : o.line_count}
                              {!cancelled && o.cancelled_line_count > 0 ? (
                                <span
                                  className="ml-1 text-[11px] font-medium text-status-red"
                                  title={`${o.cancelled_line_count} cancelled`}
                                >
                                  +{o.cancelled_line_count}
                                </span>
                              ) : null}
                            </Td>
                            <Td className={cn("num text-right text-text-2", struck)}>
                              {formatNumber(o.qty_total)}
                            </Td>
                            <Td className={cn("num text-right text-text-1", struck)}>
                              ₹{formatNumber(o.grand_total)}
                            </Td>
                            <Td className={cn("num text-text-2", struck)}>
                              {o.challan_no ?? "—"}
                            </Td>
                            <Td className={cn("num text-text-2", struck)}>
                              {o.lot_no ?? "—"}
                            </Td>
                            <Td>
                              <StatusBadge status={o.operations_status} />
                            </Td>
                            <Td>
                              <div className="flex items-center justify-end gap-0.5">
                                <IconLink
                                  href={`/order-entry/orders/${o.id}`}
                                  label={`View ${o.order_no}`}
                                  title="View"
                                  icon={<IconEye className="size-4" />}
                                />
                                {canEdit ? (
                                  <IconLink
                                    href={`/order-entry/orders/${o.id}/edit`}
                                    label={`Edit ${o.order_no}`}
                                    title="Edit"
                                    icon={<IconEdit className="size-4" />}
                                  />
                                ) : null}
                                {canTrack ? (
                                  <IconLink
                                    href={`/order-entry/tracking/${o.id}`}
                                    label={`Track ${o.order_no}`}
                                    title="Track"
                                    icon={<IconRoute className="size-4" />}
                                  />
                                ) : null}
                                {canEdit ? (
                                  cancelled ? (
                                    // Restore has NO dialog — it is the undo,
                                    // and confirming an undo is noise.
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Restore ${o.order_no}`}
                                      title="Restore order"
                                      disabled={cancelOrder.isPending}
                                      onClick={() =>
                                        cancelOrder.mutate({
                                          order: o,
                                          cancelled: false,
                                        })
                                      }
                                    >
                                      <IconRotateClockwise className="size-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Cancel ${o.order_no}`}
                                      title="Cancel order"
                                      className="text-status-red hover:bg-status-red-dim hover:text-status-red"
                                      onClick={() => setToCancel(o)}
                                    >
                                      <IconBan className="size-4" />
                                    </Button>
                                  )
                                ) : null}
                                {canEdit ? (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Delete ${o.order_no}`}
                                    title="Delete order"
                                    className="text-status-red hover:bg-status-red-dim hover:text-status-red"
                                    onClick={() => setToDelete(o)}
                                  >
                                    <IconTrash className="size-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </Td>
                          </Tr>

                          {isOpen ? (
                            <tr className="border-b border-border bg-chip/40 last:border-0">
                              <td colSpan={13} className="p-0">
                                <OrderDesignsPanel
                                  orderId={o.id}
                                  canEdit={canEdit}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </TBody>
                </Table>
              </HScroll>
            </Card>
          </Reveal>
        </>
      )}

      {/* §3.8 — the count on the left, the pager on the right */}
      {visibleRows.length > 0 ? (
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-text-2">
            <span className="num">{visibleRows.length}</span> order
            {visibleRows.length === 1 ? "" : "s"}
            {statusFilter ? " (filtered)" : ""}
          </span>
          {totalPages > 1 ? (
            <Pager
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      ) : null}

      {/* Delete confirmation (§3.10) */}
      <Dialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete order?</DialogTitle>
            <DialogDescription>
              Delete order{" "}
              <span className="num font-medium text-text-1">
                {toDelete?.order_no}
              </span>{" "}
              and all its designs? They move to Trash (hidden from lists and
              operations) and keep their stage progress. You can restore them
              from Trash anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToDelete(null)}
              disabled={del.isPending}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={() => toDelete && del.mutate(toDelete)}
              disabled={del.isPending}
            >
              {del.isPending ? (
                <>
                  <Spinner className="size-3.5" /> Deleting…
                </>
              ) : (
                <>
                  <IconTrash className="size-4" /> Delete order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel-order confirmation — restore is immediate, so it has none */}
      <Dialog
        open={!!toCancel}
        onOpenChange={(open) => {
          if (!open) setToCancel(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order?</DialogTitle>
            <DialogDescription>
              Cancel order{" "}
              <span className="num font-medium text-text-1">
                {toCancel?.order_no}
              </span>{" "}
              and all its designs? They stay on record (struck through) and are
              excluded from totals and operations. You can restore later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToCancel(null)}
              disabled={cancelOrder.isPending}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                toCancel &&
                cancelOrder.mutate({ order: toCancel, cancelled: true })
              }
              disabled={cancelOrder.isPending}
            >
              {cancelOrder.isPending ? (
                <>
                  <Spinner className="size-3.5" /> Cancelling…
                </>
              ) : (
                <>
                  <IconBan className="size-4" /> Cancel order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile quick-view (§3.7) */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="num">{selected?.order_no}</span>
              {selected ? (
                <StatusBadge status={selected.operations_status} />
              ) : null}
            </DialogTitle>
            <DialogDescription>{selected?.party_name}</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailItem term="Date" value={selected.order_date} mono />
              <DetailItem
                term="Department"
                value={selected.department ?? "—"}
              />
              <DetailItem
                term="Sales person"
                value={selected.sales_person ?? "—"}
              />
              <DetailItem term="Agent" value={selected.agent ?? "—"} />
              <DetailItem term="Haste" value={selected.haste ?? "—"} />
              <DetailItem
                term="Challan no"
                value={selected.challan_no ?? "—"}
                mono
              />
              <DetailItem term="Lot no" value={selected.lot_no ?? "—"} mono />
              <DetailItem
                term="Designs"
                value={String(
                  selected.operations_status === "CANCELLED"
                    ? selected.total_line_count
                    : selected.line_count,
                )}
                mono
              />
              {selected.cancelled_line_count > 0 ? (
                <DetailItem
                  term="Cancelled designs"
                  value={String(selected.cancelled_line_count)}
                  mono
                />
              ) : null}
              <DetailItem
                term="Total qty"
                value={`${formatNumber(selected.qty_total)} mtr`}
                mono
              />
              <DetailItem
                term="Grand total"
                value={`₹${formatNumber(selected.grand_total)}`}
                mono
              />
              <DetailItem
                term="Fabrics"
                value={
                  selected.fabrics.length ? selected.fabrics.join(", ") : "—"
                }
                className="col-span-2"
              />
            </dl>
          ) : null}
          {selected && canEdit ? (
            <div className="mt-1">
              <div className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                Manage designs
              </div>
              <div className="max-h-[40vh] overflow-y-auto pr-0.5">
                <OrderDesignsList orderId={selected.id} canEdit={canEdit} />
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-row flex-wrap justify-end gap-2">
            {selected ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/order-entry/orders/${selected.id}`} />}
              >
                <IconEye className="size-3.5" /> View
              </Button>
            ) : null}
            {selected && canEdit ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link href={`/order-entry/orders/${selected.id}/edit`} />
                }
              >
                <IconEdit className="size-3.5" /> Edit
              </Button>
            ) : null}
            {selected && canTrack ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/order-entry/tracking/${selected.id}`} />}
              >
                <IconRoute className="size-3.5" /> Track
              </Button>
            ) : null}
            {selected && canEdit ? (
              selected.operations_status === "CANCELLED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelOrder.isPending}
                  onClick={() =>
                    cancelOrder.mutate({ order: selected, cancelled: false })
                  }
                >
                  <IconRotateClockwise className="size-3.5" /> Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-status-red hover:bg-status-red-dim hover:text-status-red"
                  onClick={() => {
                    const o = selected;
                    setSelected(null);
                    setToCancel(o);
                  }}
                >
                  <IconBan className="size-3.5" /> Cancel
                </Button>
              )
            ) : null}
            {selected && canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-status-red hover:bg-status-red-dim hover:text-status-red"
                onClick={() => {
                  const o = selected;
                  setSelected(null);
                  setToDelete(o);
                }}
              >
                <IconTrash className="size-3.5" /> Delete
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Local, NOT the shared primitive (§3.5): this table's body carries no vertical
// rules, and `...props` is spread so callers can set `title` for a tooltip on
// truncated text.
function Td({
  children,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3 py-2 whitespace-nowrap", className)} {...props}>
      {children}
    </td>
  );
}

function IconLink({
  href,
  label,
  title,
  icon,
}: {
  href: string;
  label: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      nativeButton={false}
      aria-label={label}
      title={title}
      render={<Link href={href} />}
    >
      {icon}
    </Button>
  );
}

function OrderCard({ o, onOpen }: { o: OrderRow; onOpen: () => void }) {
  const cancelled = o.operations_status === "CANCELLED";
  const designs = cancelled ? o.total_line_count : o.line_count;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-card border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-border-strong active:scale-[.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "num font-semibold text-text-1",
              cancelled && "text-text-3 line-through",
            )}
          >
            {o.order_no}
          </div>
          <div
            className={cn(
              "truncate text-[13px] text-text-2",
              cancelled && "line-through",
            )}
          >
            {o.party_name}
          </div>
        </div>
        <StatusBadge status={o.operations_status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-3">
        <span className="num">{o.order_date}</span>
        <span className="num">
          {designs} design{designs === 1 ? "" : "s"}
        </span>
        {!cancelled && o.cancelled_line_count > 0 ? (
          <span className="num text-status-red">
            {o.cancelled_line_count} cancelled
          </span>
        ) : null}
        <span className="num">{formatNumber(o.qty_total)} mtr</span>
        <span className="num ml-auto text-[14px] font-semibold text-text-1">
          ₹{formatNumber(o.grand_total)}
        </span>
      </div>
    </button>
  );
}

function DetailItem({
  term,
  value,
  mono,
  className,
}: {
  term: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[12px] text-text-3">{term}</dt>
      <dd className={cn("font-medium break-words text-text-1", mono && "num")}>
        {value}
      </dd>
    </div>
  );
}
