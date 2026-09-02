"use client";

// OrderStatusBoard — docs/SCREENS.md §4A
//
// The other half of the Order status screen (§4B is the tracker). One row per
// ORDER, expandable into its design lines, with the seven workflow stages as
// seven compact columns — the wide, filterable, exportable view of where
// everything is.
//
// ── Everything happens on the server (§4A.2) ──────────────────────────────
// The grouping by order, the five KPI counts, the overall / stage / cancelled
// refinement AND the pagination are all done in lib/order-entry/
// order-status-query.ts. This component asks for one page of twenty orders
// and renders it. `placeholderData: (prev) => prev` keeps the last page on
// screen while the next one lands, so changing a filter never flashes an
// empty table.
//
// This screen is READ-ONLY. Nothing here writes; the drawer's footer sends
// the user to Operations.

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconBan,
  IconChevronRight,
  IconDownload,
  IconListCheck,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import {
  STAGE_OPTIONS,
  type OrderStatusGroup,
  type OrderStatusList,
  type OverallStatus,
} from "@/lib/order-entry/order-status";
import { hasCap } from "@/lib/order-entry/rbac";
import { useOrderEntrySession } from "@/lib/order-entry/context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HScroll } from "@/components/ui/hscroll";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import {
  useColumnPrefs,
  type ColumnDef,
} from "@/components/order-entry/shared/use-column-prefs";
import {
  appendOrderFilterParams,
  EMPTY_ORDER_FILTERS,
  hasActiveOrderFilters,
  type OrderFilterState,
} from "@/components/order-entry/shared/order-filters";
import { csvFilename, download, toCsv } from "@/components/order-entry/shared/csv";
import { useLookup } from "@/components/order-entry/orders/use-lookups";
import { ColumnPicker } from "./column-picker";
import { StatusDrawer } from "./status-drawer";
import { CurrentStageBadge, StageChip, STAGE_COLUMNS } from "./stage-cell";
import { OVERALL_LABEL, OVERALL_TONE, STAGE_DOT } from "./status-style";
import { cn } from "@/lib/utils";

// The desktop table's toggleable columns. `order` is the identity column and
// is locked on. These ids are the single source of truth for BOTH the column
// picker and the `isVisible()` guards in the header and the body, so the two
// can never drift apart.
const STATUS_COLUMNS: ColumnDef[] = [
  { id: "order", label: "Order no", locked: true },
  { id: "date", label: "Date" },
  { id: "party", label: "Party" },
  { id: "haste", label: "Haste" },
  { id: "fabric", label: "Fabric" },
  { id: "designs", label: "Designs" },
  { id: "qty", label: "Total qty" },
  { id: "total", label: "Total" },
  { id: "challan", label: "Challan" },
  { id: "lot", label: "Lot" },
  { id: "sales", label: "Sales" },
  { id: "stages", label: "Stages (7)" },
  { id: "overall", label: "Overall" },
];

const selectCls = cn(
  "h-9 rounded-field border border-border-strong bg-surface-2 px-2 text-sm text-text-1 outline-none",
  "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/25",
);

// A sticky cell's own `border-r` scrolls away with the cell in some engines;
// a 1px box-shadow does not. **The shadow IS the border** for the two pinned
// Order-no cells — hence `border-r-0` alongside it (our Td/Th carry a right
// rule by default).
const STICKY_RULE = "border-r-0 shadow-[1px_0_0_var(--border)]";

async function fetchOrderStatus(qs: string): Promise<OrderStatusList> {
  const res = await fetch(`/api/order-entry/order-status?${qs}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load order status");
  return body.data as OrderStatusList;
}

export function OrderStatusBoard({
  /** The signed-in email — the per-user key for the column prefs. */
  userKey,
}: {
  userKey?: string;
}) {
  // Deep links from the Dashboard KPI cards: ?overall=overdue, ?cancelled=1,
  // ?stage=challan. Read once, as state seeds — after mount the board owns
  // its own filters (§4A.1).
  const params = useSearchParams();
  const [searchInput, setSearchInput] = React.useState("");
  // 200ms and NO Enter — the list updates as you type (§4A.4).
  const search = useDebouncedValue(searchInput, 200);
  const [party, setParty] = React.useState("");
  const [fabric, setFabric] = React.useState("");
  const [stage, setStage] = React.useState(() => params.get("stage") ?? "");
  const [overall, setOverall] = React.useState<OverallStatus | "">(() => {
    const o = params.get("overall");
    return o === "in_progress" || o === "completed" || o === "overdue" ? o : "";
  });
  // ── Separate from `overall` ON PURPOSE ───────────────────────────────────
  // "Cancelled" is not an OverallStatus. A fully cancelled order has no live
  // stages, so its DERIVED overall is a vacuous "completed" — folding the two
  // into one variable would make the Cancelled card select Completed. Setting
  // either one clears the other.
  const [cancelledOnly, setCancelledOnly] = React.useState(
    () => params.get("cancelled") === "1",
  );
  const [filters, setFilters] =
    React.useState<OrderFilterState>(EMPTY_ORDER_FILTERS);
  const debouncedFilters = useDebouncedValue(filters, 300);
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selectedLineId, setSelectedLineId] = React.useState<string | null>(
    null,
  );
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  // Capabilities come from the module session context rather than a prop: the
  // Order Entry layout already resolved them, and re-resolving on the page
  // would be a second authz round trip for a value we hold. The EMAIL still
  // arrives as a prop (threaded page → screen → board) because the column
  // prefs key has to be stable from the very first client render.
  const { role, caps } = useOrderEntrySession();
  const canUpdate = role === "ADMIN" || hasCap(caps, "operations.edit");

  const { hidden, isVisible, toggle, reset } = useColumnPrefs(
    `oe:order-status:cols:${userKey ?? "anon"}`,
    STATUS_COLUMNS,
  );

  const parties = useLookup("PARTY");
  const fabrics = useLookup("FABRIC");

  // Reset to page 1 whenever a filter changes — page 7 of the old result set
  // is meaningless in the new one.
  React.useEffect(() => {
    setPage(1);
  }, [search, party, fabric, stage, overall, cancelledOnly, debouncedFilters]);

  // Everything except the overall / cancelled refinement, which the two count
  // queries below need to vary independently.
  const baseParams = React.useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (party) p.set("party", party);
    if (fabric) p.set("fabric", fabric);
    if (stage) p.set("stage", stage);
    appendOrderFilterParams(p, debouncedFilters);
    return p;
  }, [search, party, fabric, stage, debouncedFilters]);

  const tableParams = React.useCallback(
    (extra?: Record<string, string>) => {
      const p = baseParams();
      if (cancelledOnly) p.set("cancelled", "1");
      else if (overall) p.set("overall", overall);
      for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
      return p.toString();
    },
    [baseParams, cancelledOnly, overall],
  );

  const q = useQuery({
    queryKey: [
      "order-status",
      {
        search,
        party,
        fabric,
        stage,
        overall,
        cancelledOnly,
        page,
        filters: debouncedFilters,
      },
    ],
    queryFn: () => fetchOrderStatus(tableParams({ page: String(page) })),
    // No flash to an empty table while the next page or filter lands.
    placeholderData: (prev) => prev,
  });

  // ── The Cancelled card's number has to mean what its filter does ─────────
  // `summary.cancelled` from lib/order-entry/order-status-query.ts counts
  // cancelled LINES (`allRows.filter(r => r.isCancelled).length`), while the
  // card's filter (`cancelled=1`) selects ORDERS WITH AT LEAST ONE cancelled
  // line (`groups.filter(g => g.cancelledCount > 0)`). On real data the two
  // disagree — an order with three cancelled designs counts as 3 in the card
  // and as 1 row in the list it opens. `src/lib/**` is out of bounds here, so
  // the card is fed the ORDER count instead: the same query the card's own
  // filter would run, whose `total` is by definition the number of rows the
  // click produces. Keyed on the base filters only, so toggling between the
  // five cards and paging never refetches it.
  const cancelledCountQuery = useQuery({
    queryKey: [
      "order-status",
      "cancelled-order-count",
      { search, party, fabric, stage, filters: debouncedFilters },
    ],
    queryFn: () => {
      const p = baseParams();
      p.set("cancelled", "1");
      p.set("page", "1");
      return fetchOrderStatus(p.toString());
    },
    placeholderData: (prev) => prev,
  });

  const pageGroups = React.useMemo(() => q.data?.groups ?? [], [q.data]);
  const summary = q.data?.summary;
  const total = q.data?.total ?? 0;
  const totalPages = q.data?.totalPages ?? 1;
  // The server's answer wins, so a page number beyond the end corrects itself.
  const safePage = q.data?.page ?? page;
  const cancelledOrders = cancelledCountQuery.data?.total;

  // Flat line list for the drawer's prev/next — across the whole page, not
  // just the open group (§4A.8).
  const flatLines = React.useMemo(
    () => pageGroups.flatMap((g) => g.lines),
    [pageGroups],
  );
  const selectedIdx = selectedLineId
    ? flatLines.findIndex((l) => l.lineId === selectedLineId)
    : -1;

  function toggleExpand(orderId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function clearFilters() {
    setParty("");
    setFabric("");
    setStage("");
    setOverall("");
    setCancelledOnly(false);
    setFilters(EMPTY_ORDER_FILTERS);
  }
  const hasActiveFilters =
    !!(party || fabric || stage || overall || cancelledOnly) ||
    hasActiveOrderFilters(filters);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      // The exact rows the board shows across ALL pages: the same refinement,
      // minus the paging (`all=1` exists for this and nothing else).
      const all = await fetchOrderStatus(tableParams({ all: "1" }));
      // The board groups by order; the export is LINE-level.
      const lines = all.groups.flatMap((g) => g.lines);
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
      const body = lines.map((r) => [
        r.orderNo,
        r.party,
        r.fabric,
        r.design,
        r.qtyMtr,
        r.salesPerson ?? "",
        r.odDate,
        // Driven by STAGE_OPTIONS (the header's own list) and looked up by
        // key, so a stage cell can never land under the wrong heading.
        ...STAGE_OPTIONS.map((opt) => {
          if (r.isCancelled) return "cancelled";
          const st = r.stages.find((s) => s.stageKey === opt.key);
          if (!st) return "";
          // Stock checking reads In / Out / Pending here too, so the file
          // agrees with the cell and the drawer (§4A.6).
          if (st.stageKey === "stock_checking")
            return st.state === "done"
              ? "In stock"
              : st.stockStatus === "out_of_stock"
                ? "Out of stock"
                : "Pending";
          return st.state === "done"
            ? `Done ${st.date ? formatDate(st.date) : ""}`.trim()
            : st.state;
        }),
        `${r.doneCount}/${STAGE_OPTIONS.length}`,
        r.isCancelled ? "cancelled" : r.overall,
        r.isCancelled ? "Yes" : "No",
      ]);
      // Phase A's csv.ts — `download()` prepends the UTF-8 BOM so Excel opens
      // party names and the rupee sign correctly.
      download(toCsv([header, ...body]), csvFilename("order-status"));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Region A — Summary cards (§4A.3) ───────────────────────────── */}
      {/* All five are filters. The counts are ORDER-level, matching the rows
          the click produces. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <StatCard
          label={
            <Marker icon={<IconListCheck className="size-3.5" />}>
              Total orders
            </Marker>
          }
          value={formatCountValue(summary?.total)}
          active={overall === "" && !cancelledOnly}
          onClick={() => {
            setOverall("");
            setCancelledOnly(false);
          }}
        />
        <StatCard
          label={<Marker dot="bg-status-amber">In progress</Marker>}
          value={formatCountValue(summary?.inProgress)}
          active={overall === "in_progress" && !cancelledOnly}
          onClick={() => {
            setOverall("in_progress");
            setCancelledOnly(false);
          }}
        />
        <StatCard
          label={<Marker dot="bg-status-green">Completed</Marker>}
          value={formatCountValue(summary?.completed)}
          active={overall === "completed" && !cancelledOnly}
          onClick={() => {
            setOverall("completed");
            setCancelledOnly(false);
          }}
        />
        <StatCard
          label={<Marker dot="bg-status-red">Overdue</Marker>}
          value={formatCountValue(summary?.overdue)}
          active={overall === "overdue" && !cancelledOnly}
          onClick={() => {
            setOverall("overdue");
            setCancelledOnly(false);
          }}
        />
        <StatCard
          label={
            <Marker icon={<IconBan className="size-3.5" />}>Cancelled</Marker>
          }
          value={formatCountValue(cancelledOrders)}
          sub="Orders with a cancelled design"
          active={cancelledOnly}
          onClick={() => {
            setCancelledOnly(true);
            setOverall("");
          }}
        />
      </div>

      {/* ── Region B — Toolbar (§4A.4) ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order no, party, fabric, design…"
              aria-label="Search order no, party, fabric, design"
              className="pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters((s) => !s)}
            aria-pressed={showFilters}
            aria-label="Filters"
            title="Filters"
            className="relative shrink-0"
          >
            <IconAdjustmentsHorizontal />
            {hasActiveFilters ? (
              // The ring is what keeps the dot legible against the button edge.
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-surface" />
            ) : null}
          </Button>
          {/* Pointless where the table is hidden. */}
          <div className="hidden shrink-0 lg:block">
            <ColumnPicker
              columns={STATUS_COLUMNS}
              hidden={hidden}
              onToggle={toggle}
              onReset={reset}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            aria-label="Refresh"
            title="Refresh"
            className="shrink-0"
          >
            {q.isFetching ? <Spinner className="size-4" /> : <IconRefresh />}
          </Button>
          {/* The only primary button on the screen. */}
          <Button
            size="icon"
            onClick={() => void exportCsv()}
            disabled={exporting || total === 0}
            aria-label="Export CSV"
            title="Export CSV"
            className="shrink-0"
          >
            {exporting ? <Spinner className="size-4" /> : <IconDownload />}
          </Button>
        </div>

        {exportError ? (
          <p className="text-[12px] text-status-red">{exportError}</p>
        ) : null}

        {/* Built by hand rather than with <OrderFilters>: this board needs the
            Party / Fabric / Stage selects that panel does not have, and drops
            its Order-no and Month controls. It still uses OrderFilterState +
            appendOrderFilterParams, so the query params stay identical across
            screens (§4A.4). */}
        {showFilters ? (
          <div className="flex flex-wrap items-center gap-2 rounded-field border border-border bg-surface-2 p-2.5">
            <FilterSelect
              label="Party"
              value={party}
              onChange={setParty}
              options={parties}
            />
            <FilterSelect
              label="Fabric"
              value={fabric}
              onChange={setFabric}
              options={fabrics}
            />
            <select
              className={selectCls}
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              aria-label="At stage"
            >
              <option value="">Any stage</option>
              {STAGE_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  At: {s.label}
                </option>
              ))}
            </select>
            <Input
              value={filters.challan_no}
              onChange={(e) =>
                setFilters((f) => ({ ...f, challan_no: e.target.value }))
              }
              placeholder="Challan no"
              aria-label="Challan no"
              className="h-9 w-[130px]"
            />
            <Input
              value={filters.lot_no}
              onChange={(e) =>
                setFilters((f) => ({ ...f, lot_no: e.target.value }))
              }
              placeholder="Lot no"
              aria-label="Lot no"
              className="h-9 w-[110px]"
            />
            <Input
              value={filters.haste}
              onChange={(e) =>
                setFilters((f) => ({ ...f, haste: e.target.value }))
              }
              placeholder="Haste"
              aria-label="Haste"
              className="h-9 w-[110px]"
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filters.from}
                // Cross-bound: the browser's own picker enforces it before
                // onChange ever fires.
                max={filters.to || undefined}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, from: e.target.value }))
                }
                aria-label="From date"
                className="num h-9 w-[150px]"
              />
              <span className="text-text-3">–</span>
              <Input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, to: e.target.value }))
                }
                aria-label="To date"
                className="num h-9 w-[150px]"
              />
            </div>
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <IconX /> Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── The list — cards on mobile, the grouped table on desktop ────── */}
      {q.isLoading && !q.data ? (
        <Card size="sm" className="px-4">
          <p className="flex items-center gap-2 py-10 text-sm text-text-2">
            <Spinner /> Loading status…
          </p>
        </Card>
      ) : q.isError ? (
        <Card size="sm" className="px-4">
          <p className="py-10 text-sm text-status-red">
            {q.error instanceof Error
              ? q.error.message
              : "Failed to load order status."}
          </p>
        </Card>
      ) : pageGroups.length === 0 ? (
        <Card size="sm" className="px-4">
          <p className="py-12 text-center text-sm text-text-3">
            No orders match your filters.
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile: one tappable card per order (§4A.7) */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {pageGroups.map((g) => (
              <OrderStatusCard
                key={g.orderId}
                g={g}
                onOpen={() => setSelectedLineId(g.lines[0]?.lineId ?? null)}
              />
            ))}
          </div>

          {/* Desktop: the full grouped table (§4A.5) */}
          <Card size="sm" className="hidden min-w-0 gap-0 overflow-hidden p-0 lg:block">
            <HScroll bodyClassName="max-h-[70vh] overflow-auto">
              {/* NO column takes `w-full` here, unlike most tables in the
                  module (§0.4's slack rule): Party and Fabric are both capped
                  and truncated so the seven stage columns — the point of this
                  screen — stay on screen, and a stretched Party column would
                  fight its own `max-w`. Below 1240px the table scrolls; above
                  it the slack spreads evenly. */}
              <Table className="min-w-[1240px] border-collapse">
                <THead>
                  {/* A plain <tr>, not our <Tr>: that one carries the body
                      row's hover tint and `group` hooks, neither of which a
                      header wants. THead already supplies `sticky top-0
                      bg-surface` and Th its own bottom rule (§0.4). */}
                  <tr>
                    <Th
                      className={cn(
                        "sticky left-0 z-30 bg-surface",
                        STICKY_RULE,
                      )}
                    >
                      Order no
                    </Th>
                    {isVisible("date") && <Th>Date</Th>}
                    {isVisible("party") && <Th>Party</Th>}
                    {isVisible("haste") && <Th>Haste</Th>}
                    {isVisible("fabric") && <Th>Fabric</Th>}
                    {isVisible("designs") && (
                      <Th className="text-right">Designs</Th>
                    )}
                    {isVisible("qty") && (
                      <Th className="text-right">Total qty</Th>
                    )}
                    {isVisible("total") && <Th className="text-right">Total</Th>}
                    {isVisible("challan") && <Th>Challan</Th>}
                    {isVisible("lot") && <Th>Lot</Th>}
                    {isVisible("sales") && <Th>Sales</Th>}
                    {isVisible("stages") &&
                      STAGE_COLUMNS.map((c) => (
                        <Th key={c.key} title={c.full} className="text-center">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <span
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                STAGE_DOT[c.key] ?? "bg-text-3",
                              )}
                            />
                            {c.short}
                          </span>
                        </Th>
                      ))}
                    {isVisible("overall") && <Th>Overall</Th>}
                  </tr>
                </THead>
                <TBody>
                  {pageGroups.map((g) => {
                    const isOpen = expanded.has(g.orderId);
                    const struck = g.isCancelled
                      ? "text-text-3 line-through"
                      : "";
                    const openFirstLine = () =>
                      setSelectedLineId(g.lines[0]?.lineId ?? null);
                    return (
                      <React.Fragment key={g.orderId}>
                        {/* Order summary row */}
                        <Tr
                          onClick={openFirstLine}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open ${g.orderNo} — ${g.party}, ${g.designCount} designs`}
                          onKeyDown={(e) => {
                            // `e.target === e.currentTarget`: a Space aimed at
                            // the chevron must expand the group, not ALSO open
                            // the drawer.
                            if (
                              (e.key === "Enter" || e.key === " ") &&
                              e.target === e.currentTarget
                            ) {
                              e.preventDefault();
                              openFirstLine();
                            }
                          }}
                          className={ROW_CLS}
                        >
                          <Td className={cn(STICKY_CELL, STICKY_RULE)}>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  // Expanding is not opening.
                                  e.stopPropagation();
                                  toggleExpand(g.orderId);
                                }}
                                aria-expanded={isOpen}
                                aria-label={
                                  isOpen
                                    ? `Collapse ${g.orderNo}`
                                    : `Expand ${g.orderNo}`
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
                              <span
                                className={cn(
                                  "num font-semibold whitespace-nowrap text-text-1",
                                  struck,
                                )}
                              >
                                {g.orderNo}
                              </span>
                            </div>
                          </Td>
                          {isVisible("date") && (
                            <Td className="num whitespace-nowrap text-text-2">
                              {formatDate(g.odDate)}
                            </Td>
                          )}
                          {isVisible("party") && (
                            <Td
                              className={cn(
                                "max-w-[180px] truncate text-text-1",
                                struck,
                              )}
                            >
                              <span title={g.party}>{g.party}</span>
                            </Td>
                          )}
                          {isVisible("haste") && (
                            <Td className="whitespace-nowrap text-text-2">
                              {g.haste ?? "—"}
                            </Td>
                          )}
                          {isVisible("fabric") && (
                            <Td
                              className={cn(
                                "max-w-[200px] truncate text-text-1",
                                struck,
                              )}
                            >
                              <span title={g.fabrics.join(", ")}>
                                {g.fabrics.length === 1
                                  ? g.fabrics[0]
                                  : `${g.fabrics.length} fabrics`}
                              </span>
                            </Td>
                          )}
                          {isVisible("designs") && (
                            <Td
                              className={cn(
                                "num whitespace-nowrap text-right text-text-1",
                                struck,
                              )}
                            >
                              {g.designCount}
                              {!g.isCancelled && g.cancelledCount > 0 ? (
                                <span
                                  className="ml-1 text-[11px] font-medium text-status-red"
                                  title={`${g.cancelledCount} cancelled`}
                                >
                                  +{g.cancelledCount}
                                </span>
                              ) : null}
                            </Td>
                          )}
                          {isVisible("qty") && (
                            <Td
                              className={cn(
                                "num whitespace-nowrap text-right text-text-1",
                                struck,
                              )}
                            >
                              {formatNumber(g.qtyTotal)}
                            </Td>
                          )}
                          {isVisible("total") && (
                            <Td
                              className={cn(
                                "num whitespace-nowrap text-right text-text-1",
                                struck,
                              )}
                            >
                              ₹{formatNumber(g.grandTotal)}
                            </Td>
                          )}
                          {isVisible("challan") && (
                            <Td className="whitespace-nowrap text-text-2">
                              {g.challanNo ?? "—"}
                            </Td>
                          )}
                          {isVisible("lot") && (
                            <Td className="whitespace-nowrap text-text-2">
                              {g.lotNo ?? "—"}
                            </Td>
                          )}
                          {isVisible("sales") && (
                            <Td className="whitespace-nowrap text-text-2">
                              {g.salesPerson ?? "—"}
                            </Td>
                          )}
                          {isVisible("stages") &&
                            STAGE_COLUMNS.map((c) => {
                              // Looked up by key rather than mapped
                              // positionally, so a workflow_stages row that
                              // ever went missing shifts nothing sideways.
                              const cell = g.stages.find(
                                (s) => s.stageKey === c.key,
                              );
                              return (
                                <Td key={c.key} className="text-center">
                                  {g.isCancelled || !cell ? (
                                    <span
                                      className="text-text-3"
                                      title={
                                        g.isCancelled ? "Cancelled" : "No data"
                                      }
                                    >
                                      –
                                    </span>
                                  ) : (
                                    <StageChip cell={cell} />
                                  )}
                                </Td>
                              );
                            })}
                          {isVisible("overall") && (
                            <Td>
                              {g.isCancelled ? (
                                <CancelledTag />
                              ) : (
                                <OverallBadge overall={g.overall} />
                              )}
                            </Td>
                          )}
                        </Tr>

                        {/* Expanded design lines. Blank <Td /> for every
                            order-level column, so the grid stays aligned. */}
                        {isOpen
                          ? g.lines.map((line) => {
                              const lstruck = line.isCancelled
                                ? "text-text-3 line-through"
                                : "";
                              return (
                                <Tr
                                  key={line.lineId}
                                  onClick={() => setSelectedLineId(line.lineId)}
                                  tabIndex={0}
                                  role="button"
                                  aria-label={`Open ${g.orderNo} — ${line.fabric} ${line.design}`}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSelectedLineId(line.lineId);
                                    }
                                  }}
                                  // `bg-surface` explicitly (§4A.5): the
                                  // pinned first cell paints its own opaque
                                  // ground, and the two have to match.
                                  className={cn(
                                    ROW_CLS,
                                    "bg-surface text-[13px]",
                                  )}
                                >
                                  <Td
                                    className={cn(
                                      STICKY_CELL,
                                      STICKY_RULE,
                                      "pl-8",
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <IconChevronRight className="size-3.5 shrink-0 -rotate-45 text-text-3" />
                                      <span
                                        className={cn(
                                          "num font-medium text-text-1",
                                          lstruck,
                                        )}
                                      >
                                        {line.design}
                                      </span>
                                    </div>
                                  </Td>
                                  {isVisible("date") && <Td />}
                                  {isVisible("party") && <Td />}
                                  {isVisible("haste") && <Td />}
                                  {isVisible("fabric") && (
                                    <Td
                                      className={cn(
                                        "max-w-[200px] truncate text-text-1",
                                        lstruck,
                                      )}
                                    >
                                      <span title={line.fabric}>
                                        {line.fabric}
                                      </span>
                                    </Td>
                                  )}
                                  {isVisible("designs") && <Td />}
                                  {isVisible("qty") && (
                                    <Td
                                      className={cn(
                                        "num whitespace-nowrap text-right text-text-1",
                                        lstruck,
                                      )}
                                    >
                                      {formatNumber(Number(line.qtyMtr))}
                                    </Td>
                                  )}
                                  {isVisible("total") && (
                                    <Td
                                      className={cn(
                                        "num whitespace-nowrap text-right text-text-1",
                                        lstruck,
                                      )}
                                    >
                                      {line.lineTotal == null
                                        ? "—"
                                        : `₹${formatNumber(Number(line.lineTotal))}`}
                                    </Td>
                                  )}
                                  {isVisible("challan") && <Td />}
                                  {isVisible("lot") && <Td />}
                                  {isVisible("sales") && <Td />}
                                  {isVisible("stages") &&
                                    STAGE_COLUMNS.map((c) => {
                                      const cell = line.stages.find(
                                        (s) => s.stageKey === c.key,
                                      );
                                      return (
                                        <Td
                                          key={c.key}
                                          className="text-center"
                                        >
                                          {line.isCancelled || !cell ? (
                                            <span
                                              className="text-text-3"
                                              title={
                                                line.isCancelled
                                                  ? "Cancelled"
                                                  : "No data"
                                              }
                                            >
                                              –
                                            </span>
                                          ) : (
                                            <StageChip cell={cell} />
                                          )}
                                        </Td>
                                      );
                                    })}
                                  {isVisible("overall") && (
                                    <Td>
                                      {line.isCancelled ? (
                                        <CancelledTag />
                                      ) : (
                                        <OverallBadge overall={line.overall} />
                                      )}
                                    </Td>
                                  )}
                                </Tr>
                              );
                            })
                          : null}
                      </React.Fragment>
                    );
                  })}
                </TBody>
              </Table>
            </HScroll>
          </Card>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="num text-text-2">
            {total} order{total === 1 ? "" : "s"}
          </span>
          <Pager
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            disabled={q.isFetching}
          />
        </div>
      ) : null}

      {/* The detail drawer, per design line (§4A.8) */}
      {selectedIdx >= 0 && flatLines[selectedIdx] ? (
        <StatusDrawer
          lineId={flatLines[selectedIdx].lineId}
          canUpdate={canUpdate}
          onClose={() => setSelectedLineId(null)}
          onPrev={() =>
            setSelectedLineId(flatLines[Math.max(0, selectedIdx - 1)].lineId)
          }
          onNext={() =>
            setSelectedLineId(
              flatLines[Math.min(flatLines.length - 1, selectedIdx + 1)].lineId,
            )
          }
          hasPrev={selectedIdx > 0}
          hasNext={selectedIdx < flatLines.length - 1}
        />
      ) : null}
    </div>
  );
}

// Both table rows are activatable: click or Enter/Space opens the drawer.
const ROW_CLS = cn(
  "cursor-pointer transition-colors outline-none",
  "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
);

// The pinned Order-no cell. It repeats the row's own hover / focus states,
// because a sticky cell is painted out of the row's stacking context and
// would otherwise stay stubbornly plain while the rest of the row lit up.
const STICKY_CELL =
  "sticky left-0 z-10 bg-surface group-hover:bg-surface-2 group-focus-visible:bg-surface-2";

/** `—` when the number is not in yet (§4A.3). */
function formatCountValue(value: number | undefined): string {
  return value == null ? "—" : String(value);
}

/** The KPI label with its tone dot or icon in front of it (§4A.3). */
function Marker({
  dot,
  icon,
  children,
}: {
  dot?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon ? (
        <span className="text-text-3" aria-hidden>
          {icon}
        </span>
      ) : (
        <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
      )}
      {children}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      className={selectCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value="">{label}: any</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ── Mobile card (§4A.7) ────────────────────────────────────────────────────
// Four bands: identity + badge · three figures · meta · progress. Tapping it
// opens the drawer on the order's first line.
function OrderStatusCard({
  g,
  onOpen,
}: {
  g: OrderStatusGroup;
  onOpen: () => void;
}) {
  const struck = g.isCancelled ? "text-text-3 line-through" : "";
  const stageCount = STAGE_OPTIONS.length;
  const donePct = Math.round((g.doneCount / stageCount) * 100);
  const fabricLabel =
    g.fabrics.length === 0
      ? "—"
      : g.fabrics.length === 1
        ? g.fabrics[0]
        : `${g.fabrics.length} fabrics`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-card border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-border-strong active:scale-[.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("num text-[15px] font-semibold text-text-1", struck)}>
            {g.orderNo}
          </div>
          <div className={cn("mt-0.5 truncate text-[12px] text-text-2", struck)}>
            {g.party} · <span className="num">{formatDate(g.odDate)}</span>
          </div>
        </div>
        {g.isCancelled ? <CancelledTag /> : <OverallBadge overall={g.overall} />}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border pt-2.5">
        <Fig label="Designs" value={String(g.designCount)} />
        <Fig label="Total qty" value={`${formatNumber(g.qtyTotal)} m`} />
        <Fig label="Amount" value={`₹${formatNumber(g.grandTotal)}`} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-3">
        <span className="min-w-0 max-w-full truncate">{fabricLabel}</span>
        {g.salesPerson ? (
          <span className="truncate">· {g.salesPerson}</span>
        ) : null}
        {g.cancelledCount > 0 ? (
          <span className="num font-medium text-status-red">
            {g.cancelledCount} cancelled
          </span>
        ) : null}
      </div>

      {/* Hidden entirely for a fully cancelled order — there is no progress
          to report, and a 0/7 bar reads as "nothing has happened yet". */}
      {g.isCancelled ? null : (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <div className="mb-1 flex items-center justify-between text-[11px] text-text-3">
            <span>Progress</span>
            <span className="num">
              {g.doneCount}/{stageCount} stages
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-chip">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${donePct}%` }}
            />
          </div>
          <div className="mt-2">
            <CurrentStageBadge
              stages={g.stages}
              currentStageKey={g.currentStageKey}
              aggregate
            />
          </div>
        </div>
      )}
    </button>
  );
}

/** Aligned label-over-value figure used in the mobile status card. */
function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-[0.04em] text-text-3 uppercase">
        {label}
      </div>
      <div className="num mt-0.5 truncate text-[13px] font-semibold text-text-1">
        {value}
      </div>
    </div>
  );
}

function OverallBadge({ overall }: { overall: OverallStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-pill px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        OVERALL_TONE[overall],
      )}
    >
      {OVERALL_LABEL[overall]}
    </span>
  );
}

/** Shown in place of the overall badge on a cancelled order / design line. */
function CancelledTag() {
  return (
    <span className="inline-flex rounded-pill bg-status-red-dim px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-status-red">
      Cancelled
    </span>
  );
}
