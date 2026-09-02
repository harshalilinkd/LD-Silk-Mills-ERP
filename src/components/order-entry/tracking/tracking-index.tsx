"use client";

// TrackingIndex — docs/SCREENS.md §5.1
//
// The list of every order, whose only job is to get you into ONE of them.
// Structurally the Orders table with the actions replaced by a single Track
// button, and **server-side pagination** (`page=N`, not `all=1`): this list
// carries no KPI cards that would have to stay honest against the whole set,
// so there is no reason to pull it.
//
// Search applies ITSELF — `useDebouncedValue(…, 300)`, no submit button. Two
// effects reset the page: one on the debounced filters, one on the debounced
// search (which also commits the trimmed value).
//
// Every order is trackable the moment it is entered. Challan and lot are
// optional and are NOT a precondition, which is why nothing here filters on
// them.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconDownload,
  IconRefresh,
  IconRoute,
  IconSearch,
} from "@tabler/icons-react";

import {
  formatCount,
  formatNumber,
  type OrderRow,
  type OrdersList,
} from "@/lib/order-entry/orders";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import {
  appendOrderFilterParams,
  EMPTY_ORDER_FILTERS,
  hasActiveOrderFilters,
  OrderFilters,
  type OrderFilterState,
} from "@/components/order-entry/shared/order-filters";
import { csvFilename, download, toCsv } from "@/components/order-entry/shared/csv";
import { cn } from "@/lib/utils";

async function fetchOrders(qs: string): Promise<OrdersList> {
  const res = await fetch(`/api/order-entry/orders?${qs}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load orders.");
  return body.data as OrdersList;
}

export function TrackingIndex() {
  const router = useRouter();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);
  const [filters, setFilters] =
    React.useState<OrderFilterState>(EMPTY_ORDER_FILTERS);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  // The phone-only detail popup. A phone cannot show thirteen columns, and
  // tapping a card straight through to the board skips the "is this the right
  // order?" check — so the card opens this first.
  const [detail, setDetail] = React.useState<OrderRow | null>(null);

  const debouncedFilters = useDebouncedValue(filters, 300);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // One query string builder for the list AND the export, so the CSV can never
  // describe a different set of orders than the table above it.
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
    queryKey: [
      "orders",
      { search, page, filters: debouncedFilters, scope: "operations" },
    ],
    queryFn: () => fetchOrders(buildParams({ page: String(page) })),
    // No flash to an empty table while the next page or search lands.
    placeholderData: (prev) => prev,
  });

  // Any filter change resets to the first page…
  React.useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  // …and so does a search, which also commits the trimmed term.
  React.useEffect(() => {
    setPage(1);
    setSearch(debouncedSearch.trim());
  }, [debouncedSearch]);

  // The export re-fetches with `all=1` rather than writing the twenty rows in
  // hand: the file must carry the whole filtered set. Twelve columns — the
  // Orders export (§3.11) minus Cancelled, which has no meaning on a board
  // that only ever shows active lines.
  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const all = await fetchOrders(buildParams({ all: "1" }));
      const rows = [
        [
          "Order no",
          "Date",
          "Party",
          "Haste",
          "Agent",
          "Fabrics",
          "Designs",
          "Total Qty",
          "Total Amount",
          "Challan no",
          "Lot no",
          "Status",
        ],
        ...all.orders.map((o) => [
          o.order_no,
          o.order_date,
          o.party_name,
          o.haste ?? "",
          o.agent ?? "",
          // ` | `, not a comma — the file is comma-separated.
          o.fabrics.join(" | "),
          o.line_count,
          o.qty_total,
          o.grand_total,
          o.challan_no ?? "",
          o.lot_no ?? "",
          o.operations_status,
        ]),
      ];
      download(toCsv(rows), csvFilename("operations"));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const data = list.data;
  const rows = data?.orders ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Operations
          </h1>
          <p className="mt-1 text-[13px] text-text-3">
            <span className="num">{formatCount(total)}</span> order
            {total === 1 ? "" : "s"} to track · pick one to open its 7-stage
            board
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order no, party, challan, lot…"
              aria-label="Search orders"
              className="h-9 pl-8 text-[13px]"
            />
          </div>
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
          </div>
        </div>

        {showFilters ? (
          <OrderFilters value={filters} onChange={setFilters} />
        ) : null}

        {exportError ? (
          <p className="text-[12px] text-status-red">{exportError}</p>
        ) : null}
      </div>

      <Reveal index={0}>
        <Card size="sm" className="py-0">
          {list.isLoading ? (
            <div className="flex items-center gap-2 px-4 py-10 text-[13px] text-text-2">
              <Spinner /> Loading orders…
            </div>
          ) : list.isError ? (
            <div className="px-4 py-10 text-[13px] text-status-red">
              {(list.error as Error)?.message ?? "Failed to load orders."}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-text-2">
              No orders found{search ? ` for “${search}”` : ""}.
            </div>
          ) : (
            <>
              <HScroll
                className="hidden md:block"
                bodyClassName="max-h-[calc(100vh-19rem)] overflow-auto"
              >
                <Table className="min-w-[1040px]">
                  <THead>
                    <tr>
                      <Th>Order no</Th>
                      <Th>Date</Th>
                      {/* The one column that absorbs the slack (§0.4). */}
                      <Th className="w-full">Party</Th>
                      <Th>Haste</Th>
                      <Th>Agent</Th>
                      <Th>Fabrics</Th>
                      <Th className="text-right">Designs</Th>
                      <Th className="text-right">Total Qty</Th>
                      <Th className="text-right">Total Amount</Th>
                      <Th>Challan no</Th>
                      <Th>Lot no</Th>
                      <Th>Status</Th>
                      <Th className="text-right" />
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((o) => (
                      <Tr
                        key={o.id}
                        onClick={() =>
                          router.push(`/order-entry/tracking/${o.id}`)
                        }
                        className={cn(
                          "cursor-pointer",
                          o.operations_status === "CANCELLED" && "opacity-60",
                        )}
                      >
                        <Td className="num font-semibold whitespace-nowrap text-accent-text">
                          {o.order_no}
                        </Td>
                        <Td className="num whitespace-nowrap text-text-2">
                          {o.order_date}
                        </Td>
                        <Td className="whitespace-nowrap text-text-1">
                          {o.party_name}
                        </Td>
                        <Td className="whitespace-nowrap text-text-2">
                          {o.haste || "—"}
                        </Td>
                        <Td className="whitespace-nowrap text-text-2">
                          {o.agent || "—"}
                        </Td>
                        {/* The one cell that WRAPS — a five-fabric order is
                            otherwise a single 600px line. */}
                        <Td className="min-w-[160px] whitespace-normal text-text-2">
                          {o.fabrics.length ? o.fabrics.join(", ") : "—"}
                        </Td>
                        <Td className="num text-right text-text-2">
                          {o.line_count}
                        </Td>
                        <Td className="num text-right whitespace-nowrap text-text-2">
                          {formatNumber(o.qty_total)}
                        </Td>
                        <Td className="num text-right whitespace-nowrap text-text-1">
                          ₹{formatNumber(o.grand_total)}
                        </Td>
                        <Td className="num whitespace-nowrap text-text-2">
                          {o.challan_no || "—"}
                        </Td>
                        <Td className="num whitespace-nowrap text-text-2">
                          {o.lot_no || "—"}
                        </Td>
                        <Td>
                          <StatusBadge status={o.operations_status} />
                        </Td>
                        {/* The row is the link; this cell stops the click so
                            the Track button does not fire it twice. */}
                        <Td
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            nativeButton={false}
                            render={
                              <Link href={`/order-entry/tracking/${o.id}`} />
                            }
                          >
                            <IconRoute className="size-3.5" /> Track
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </HScroll>

              {/* Phone: a card list. Tapping opens the detail dialog, not the
                  board — see the note on `detail` above. */}
              <ul className="flex flex-col gap-2.5 p-3 md:hidden">
                {rows.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setDetail(o)}
                      className="flex w-full flex-col gap-2 rounded-field border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong active:bg-surface-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="num font-semibold text-text-1">
                          {o.order_no}
                        </span>
                        <StatusBadge status={o.operations_status} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-text-2">
                          {o.party_name}
                        </span>
                        <span className="num shrink-0 text-text-3">
                          {o.order_date}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-3">
                        <span className="num">{o.line_count} designs</span>
                        <span className="num">
                          {formatNumber(o.qty_total)} mtr
                        </span>
                        {o.challan_no ? (
                          <span>Challan {o.challan_no}</span>
                        ) : null}
                        {o.haste ? <span>· {o.haste}</span> : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </Reveal>

      {data && data.total_pages > 1 ? (
        <Pager
          className="justify-end"
          page={data.page}
          totalPages={data.total_pages}
          onPageChange={setPage}
          disabled={list.isFetching}
        />
      ) : null}

      {/* Order detail popup — the mobile card list's "is this the right
          order?" step before the board. */}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="num">{detail?.order_no}</span>
              {detail ? (
                <StatusBadge status={detail.operations_status} />
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {detail?.party_name} ·{" "}
              <span className="num">{detail?.order_date}</span>
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Field label="Order no" value={detail?.order_no} num />
            <Field label="Order date" value={detail?.order_date} num />
            <Field label="Challan no" value={detail?.challan_no || "—"} num />
            <Field label="Lot no" value={detail?.lot_no || "—"} num />
            <Field
              label="Designs"
              value={detail ? String(detail.line_count) : ""}
              num
            />
            <Field
              label="Total qty"
              value={detail ? `${formatNumber(detail.qty_total)} mtr` : ""}
              num
            />
            <Field label="Haste" value={detail?.haste || "—"} />
            <Field label="Agent" value={detail?.agent || "—"} />
            <Field
              label="Party"
              value={detail?.party_name}
              className="col-span-2"
            />
            <Field
              label="Fabrics"
              value={detail?.fabrics.length ? detail.fabrics.join(", ") : "—"}
              className="col-span-2"
            />
          </dl>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Close
            </Button>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={
                    detail ? `/order-entry/tracking/${detail.id}` : "#"
                  }
                />
              }
            >
              <IconRoute className="size-3.5" /> Track workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  num,
  className,
}: {
  label: string;
  value?: string;
  num?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium text-text-3">{label}</dt>
      <dd
        className={cn(
          "font-medium break-words text-text-1",
          num && "num",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
