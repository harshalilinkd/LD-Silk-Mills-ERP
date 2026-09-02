"use client";

// OrderTracker — docs/SCREENS.md §4B
//
// SHARED, NOT DUPLICATED: the same component is the default view of Orders
// (§3.1) and one of the two views on Order status (§4). It answers one
// question — *where is this order?*
//
// Search → quality rows on the left → the full status on the right, with
// ← / → to walk the matches.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconChevronRight,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import type {
  OrderStatusList,
  OrderStatusRow,
} from "@/lib/order-entry/order-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HScroll } from "@/components/ui/hscroll";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import {
  appendOrderFilterParams,
  EMPTY_ORDER_FILTERS,
  hasActiveOrderFilters,
  OrderFilters,
  type OrderFilterState,
} from "@/components/order-entry/shared/order-filters";
import { cn } from "@/lib/utils";
import { TrackerDetail } from "./tracker-detail";
import { StageCell, STAGE_COLUMNS, STAGE_COL_WIDTH } from "./stage-cell";
import {
  flattenLines,
  toneOfLines,
  toQualityGroups,
  TONE_LABEL,
  TONE_TEXT,
  type QualityGroup,
  type RowTone,
} from "./quality-groups";

// ── The three pinned identity columns (§4B.4) ─────────────────────────────
// Explicit pixel widths, because each one's `left` offset is the sum of the
// widths before it. The operator's complaint was losing track of which
// quality a row belonged to once they scrolled sideways — so these never
// leave.
const W_ORDER = 84;
const W_PARTY = 168;
const W_QUALITY = 176;
const L_PARTY = W_ORDER; // 84
const L_QUALITY = W_ORDER + W_PARTY; // 252

const stickyBase = "sticky z-[2] border-r border-border px-2.5 py-2 align-middle";
// Body cells take the ROW's own background (`bg-[inherit]`) so the pinned
// columns keep the hover / selected tint. Header cells are given an opaque one
// OUTRIGHT — stacking two background utilities leaves the winner to CSS source
// order, and a see-through sticky header is exactly the bug this solves.
const stickyCell = `${stickyBase} bg-[inherit]`;
const stickyHead = `${stickyBase} z-[5] bg-surface`;

// ── Row backgrounds must be OPAQUE ─────────────────────────────────────────
// The source app's `--inset` and `--accent-soft` were solid colours. Ours
// (`--chip`, and any `/10` alpha tint) are translucent, and a translucent
// background on a sticky cell lets the columns scrolling underneath show
// through it. So the two tinted states are composed opaquely against
// `--surface` with color-mix instead of layered as alpha. Both tokens are
// per-theme, so this still resolves correctly in light and dark.
//
// Status is NEVER carried here — see §4B.1. The background only says
// "hovered" / "selected" / "flashed"; the STATUS is the text colour.
const SELECTED_BG = "bg-[color-mix(in_oklch,var(--surface),var(--primary)_12%)]";
const FLASH_BG = "bg-[color-mix(in_oklch,var(--surface),var(--primary)_28%)]";
const SELECTED_ROW = cn(
  SELECTED_BG,
  "hover:bg-[color-mix(in_oklch,var(--surface),var(--primary)_12%)]",
);
const FLASH_ROW = cn(
  FLASH_BG,
  "hover:bg-[color-mix(in_oklch,var(--surface),var(--primary)_28%)]",
);

async function fetchOrderStatus(qs: string): Promise<OrderStatusList> {
  const res = await fetch(`/api/order-entry/order-status?${qs}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load order status");
  return body.data as OrderStatusList;
}

export function OrderTracker({
  initialSearch = "",
  /** Rendered inside the search bar, e.g. the view switch + New order. */
  toolbar,
}: {
  initialSearch?: string;
  toolbar?: React.ReactNode;
}) {
  const [searchInput, setSearchInput] = React.useState(initialSearch);
  // 200ms, and NO Enter — the results update as you type (§4B.2).
  const search = useDebouncedValue(searchInput, 200);
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // The same order no / challan / lot / haste / month / date filters the
  // Orders table has — the need for them does not stop at the screen boundary.
  const [filters, setFilters] =
    React.useState<OrderFilterState>(EMPTY_ORDER_FILTERS);
  const debouncedFilters = useDebouncedValue(filters, 300);
  const [showFilters, setShowFilters] = React.useState(false);
  // The status legend doubles as a filter: click "Completed" to see only those.
  const [toneFilter, setToneFilter] = React.useState<RowTone | "">("");
  // Collapsed by default — one row per quality is the point, and the stage
  // cells on that row already answer "how far along?".
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Where the floating panel sits. null = its default corner; dragging pins it
  // to explicit viewport coordinates.
  const [panelPos, setPanelPos] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const dragOffset = React.useRef<{ dx: number; dy: number } | null>(null);
  // Briefly highlights the row the panel jumped to, so the eye can find it.
  const [flashId, setFlashId] = React.useState<string | null>(null);
  // The table fills whatever is left of the window — measured, not calculated.
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyMax, setBodyMax] = React.useState<number>();

  React.useEffect(() => {
    setPage(1);
  }, [search, debouncedFilters]);

  const q = useQuery({
    queryKey: ["order-tracker", { search, page, filters: debouncedFilters }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      appendOrderFilterParams(p, debouncedFilters);
      p.set("page", String(page));
      return fetchOrderStatus(p.toString());
    },
    // No flash to an empty table while the next page or search lands.
    placeholderData: (prev) => prev,
  });

  const allGroups = React.useMemo(
    () => toQualityGroups(q.data?.groups ?? []),
    [q.data],
  );
  // How many rows on this page sit in each status — shown on the legend so the
  // filter says what it will do before you click it.
  const toneCounts = React.useMemo(() => {
    const t: Record<RowTone, number> = {
      done: 0,
      progress: 0,
      none: 0,
      cancelled: 0,
    };
    for (const g of allGroups) t[g.tone] += 1;
    return t;
  }, [allGroups]);
  // §4B.3: this filters THE PAGE IN HAND, not the query. The server paginates
  // by ORDER and the tones are computed per QUALITY after the rollup, so there
  // is no param that could push it down; the counts beside each pill say how
  // many rows it will leave.
  const groups = React.useMemo(
    () =>
      toneFilter ? allGroups.filter((g) => g.tone === toneFilter) : allGroups,
    [allGroups, toneFilter],
  );
  // The flat list the arrows walk — every colour, in the order shown.
  const lines = React.useMemo(() => flattenLines(groups), [groups]);

  // Nothing is selected until a row is clicked — the table keeps the full
  // width until then. A selection that falls out of the results is dropped.
  React.useEffect(() => {
    setSelectedId((cur) =>
      cur && lines.some((l) => l.lineId === cur) ? cur : null,
    );
  }, [lines]);

  const index = selectedId ? lines.findIndex((l) => l.lineId === selectedId) : -1;
  const selected = index >= 0 ? lines[index] : undefined;
  const selectedGroup = selected
    ? groups.find((g) => g.key === `${selected.orderId}|${selected.fabric}`)
    : undefined;
  // The order-level row the line came from, for the whole-order totals.
  const selectedOrder = selected
    ? q.data?.groups.find((o) => o.orderId === selected.orderId)
    : undefined;

  const hasSelection = index >= 0;

  const step = React.useCallback(
    (by: number) => {
      if (lines.length === 0) return;
      // Wrapping, modulo the list: Next on the last match goes back to the
      // first rather than dead-ending.
      const next = (index + by + lines.length) % lines.length;
      setSelectedId(lines[next].lineId);
    },
    [index, lines],
  );

  // Window-level keyboard (§4B.5). Escape closes; ← / → / Enter step through
  // the matches (Shift+Enter backwards).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      const isNav =
        e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Enter";
      // Only while something is selected — otherwise Enter on an empty screen
      // would open a row nobody asked for.
      if (!isNav || !hasSelection) return;
      const el = e.target as HTMLElement | null;
      // NEVER hijack a keystroke meant for a field or a focused control: the
      // search box is an INPUT, the Refresh button is a BUTTON, and ← / → and
      // Enter all mean something there already.
      if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      e.preventDefault();
      step(e.key === "ArrowLeft" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, hasSelection]);

  // ── The table height is MEASURED, not calculated (§4B.4) ────────────────
  // A hard-coded `calc(100vh - Nrem)` cannot know how tall the page header,
  // the search bar (which wraps on narrow screens) and the legend actually
  // came out, so it always leaves a band of dead space above the footer.
  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const fit = () => {
      // Measured against the DOCUMENT, not the viewport, so a page that
      // happens to be scrolled when this runs does not produce a short table.
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Room for the pagination strip inside the card, the app footer, and a
      // little breathing space beneath.
      const RESERVE = 108;
      setBodyMax(Math.max(240, window.innerHeight - top - RESERVE));
    };
    fit();
    window.addEventListener("resize", fit);
    // The toolbar above changes height when the search bar wraps or the
    // filter panel opens, which moves the card's top. `document.body` is what
    // the spec observes; in THIS shell the scroll container is <main>, not the
    // document, so body never resizes when the toolbar rewraps — the toolbar
    // itself is observed as well. Watching only one of them misses half the
    // cases, and neither is circular (the toolbar's height does not depend on
    // the table's).
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    if (toolbarRef.current) ro.observe(toolbarRef.current);
    return () => {
      window.removeEventListener("resize", fit);
      ro.disconnect();
    };
  }, []);

  // ── Dragging the panel (§4B.5) ─────────────────────────────────────────
  // Switched to explicit coordinates on the first move so it stops being
  // anchored to the right edge.
  function startDrag(e: React.PointerEvent) {
    const el = panelRef.current;
    if (!el || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setPanelPos({ x: r.left, y: r.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent) {
    const off = dragOffset.current;
    const el = panelRef.current;
    if (!off || !el) return;
    const r = el.getBoundingClientRect();
    // Keep a grabbable strip on screen whichever way it is dragged: at least
    // 80px of the panel horizontally, and its title bar never past the bottom.
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 48;
    setPanelPos({
      x: Math.min(Math.max(e.clientX - off.dx, 80 - r.width), maxX),
      y: Math.min(Math.max(e.clientY - off.dy, 8), maxY),
    });
  }
  function endDrag() {
    dragOffset.current = null;
  }

  // Bring the line the panel is describing into view: open its quality (a
  // colour row does not exist in the DOM while the group is collapsed) and
  // scroll to it. `centre` is for the explicit ⌖ button; following the panel
  // automatically uses "nearest", which moves the table as little as possible.
  const revealLine = React.useCallback(
    (line: OrderStatusRow, centre: boolean) => {
      const groupKey = `${line.orderId}|${line.fabric}`;
      // EXACTLY ONE quality stays open. Leaving WALNUT expanded while the
      // panel has moved on to Woodland is how the table and the panel start
      // telling different stories.
      setExpanded((prev) =>
        prev.size === 1 && prev.has(groupKey) ? prev : new Set([groupKey]),
      );
      // Let the expansion render before measuring where to scroll — the row
      // does not exist until the group has.
      requestAnimationFrame(() => {
        const el =
          document.querySelector(`[data-line-id="${CSS.escape(line.lineId)}"]`) ??
          document.querySelector(`[data-group-key="${CSS.escape(groupKey)}"]`);
        el?.scrollIntoView({
          behavior: "smooth",
          block: centre ? "center" : "nearest",
        });
      });
    },
    [],
  );

  // The table follows the panel. Walking through with Next used to leave the
  // panel describing a row that was collapsed and off-screen, so the operator
  // had to keep pressing ⌖ to catch up.
  React.useEffect(() => {
    if (!selected) return;
    revealLine(selected, false);
    // Only when the SELECTION moves — not on every re-render of the same line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The ⌖ button centres the row and flashes it, for when the eye has lost it:
  // repeated Next clicks walk the panel far from wherever the page is scrolled.
  const goToRow = React.useCallback(() => {
    if (!selected) return;
    setFlashId(selected.lineId);
    revealLine(selected, true);
  }, [selected, revealLine]);

  // Clear the highlight once it has done its job.
  React.useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(t);
  }, [flashId]);

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalOrders = q.data?.total ?? 0;
  const totalPages = q.data?.totalPages ?? 1;
  const safePage = q.data?.page ?? page;

  return (
    <div className="flex flex-col gap-3">
      <div ref={toolbarRef} className="flex flex-col gap-3">
        {/* Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order no or party name — results update as you type"
              aria-label="Search order no or party name"
              className="h-10 w-full pr-24 pl-9"
            />
            {/* Live feedback, and what the 24px of right padding is reserved
                for: a spinner while the search runs, then the count. Without
                it a slow round trip reads as "nothing happened — do I need to
                press Enter?". */}
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-text-3">
              {q.isFetching ? (
                <Spinner className="size-4" />
              ) : search ? (
                <span className="num">
                  {totalOrders} order{totalOrders === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
          </div>
          {toolbar}
          <Button
            variant={
              showFilters || hasActiveOrderFilters(filters) ? "default" : "outline"
            }
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="shrink-0"
          >
            <IconAdjustmentsHorizontal /> Filters
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            aria-label="Refresh"
            className="shrink-0"
          >
            {q.isFetching ? <Spinner className="size-3.5" /> : <IconRefresh />}
          </Button>
        </div>

        {/* The status key doubles as a filter — same colours, now clickable. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="mr-0.5 font-medium text-text-3">Status</span>
          {(["done", "progress", "none", "cancelled"] as RowTone[]).map((t) => {
            const active = toneFilter === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => setToneFilter(active ? "" : t)}
                title={
                  active
                    ? "Showing only these — click to clear"
                    : `Show only ${TONE_LABEL[t].toLowerCase()} rows on this page`
                }
                className={cn(
                  "rounded-pill px-2 py-0.5 font-semibold transition-colors",
                  TONE_TEXT[t],
                  active
                    ? "bg-chip ring-1 ring-border-strong ring-inset"
                    : "hover:bg-chip",
                )}
              >
                {TONE_LABEL[t]}
                <span className="num ml-1 font-normal opacity-70">
                  {toneCounts[t]}
                </span>
              </button>
            );
          })}
          {toneFilter ? (
            <button
              type="button"
              onClick={() => setToneFilter("")}
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-text-2 hover:bg-chip"
            >
              <IconX className="size-3" /> Clear
            </button>
          ) : null}
        </div>

        {showFilters ? (
          <OrderFilters value={filters} onChange={setFilters} />
        ) : null}
      </div>

      {/* The table keeps the whole width. The detail panel floats over its
          right-hand edge when a row is opened, so nothing is resized and
          whatever it covers is still reachable by scrolling the table. */}
      <div ref={cardRef} className="relative">
        <Card className="min-w-0 gap-0 overflow-hidden p-0">
          {q.isLoading && !q.data ? (
            <p className="flex items-center gap-2 px-4 py-10 text-sm text-text-2">
              <Spinner /> Loading orders…
            </p>
          ) : q.isError ? (
            <p className="px-4 py-10 text-center text-sm text-status-red">
              {q.error instanceof Error
                ? q.error.message
                : "Failed to load order status."}
            </p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-2">
              {search ? `Nothing matches “${search}”.` : "No orders to show."}
            </p>
          ) : (
            <HScroll
              // HScroll's body already carries `overflow-x-auto`; the vertical
              // axis is named explicitly rather than with the `overflow-auto`
              // shorthand, which would fight it depending on stylesheet order.
              bodyClassName="overflow-y-auto"
              bodyStyle={{ maxHeight: bodyMax }}
            >
              {/* No column takes `w-full` here, unlike every other table in
                  the module: the three identity columns are PINNED, so their
                  widths have to stay exactly W_ORDER / W_PARTY / W_QUALITY for
                  the `left` offsets to line up, and stretching any of the
                  remaining ones would push the seven stage columns — the point
                  of the screen — off the right edge. Below 1180px the table
                  scrolls; above it the slack spreads evenly. */}
              <Table className="min-w-[1180px]">
                {/* THead already supplies `sticky top-0 bg-surface` and Th the
                    bottom rule (§0.4), which is the spec's header row exactly;
                    only the 12px type is local to this table. */}
                <THead>
                  <tr className="bg-surface text-[12px] font-bold tracking-[0.04em] text-text-1 uppercase">
                    <Th
                      className={cn(stickyHead, "left-0 text-[12px]")}
                      style={{ width: W_ORDER, minWidth: W_ORDER }}
                    >
                      Order no
                    </Th>
                    <Th
                      className={cn(stickyHead, "text-[12px]")}
                      style={{ left: L_PARTY, width: W_PARTY, minWidth: W_PARTY }}
                    >
                      Party
                    </Th>
                    <Th
                      className={cn(stickyHead, "text-[12px]")}
                      style={{
                        left: L_QUALITY,
                        width: W_QUALITY,
                        minWidth: W_QUALITY,
                      }}
                    >
                      Quality
                    </Th>
                    <Th className="px-2.5 py-2 text-[12px]">OD date</Th>
                    <Th className="px-2.5 py-2 text-[12px] text-right">Designs</Th>
                    <Th className="px-2.5 py-2 text-[12px] text-right">Mtr</Th>
                    <Th className="px-2.5 py-2 text-[12px]">Sales</Th>
                    <Th className="px-2.5 py-2 text-[12px]">Status</Th>
                    {STAGE_COLUMNS.map((c) => (
                      <Th
                        key={c.key}
                        title={c.full}
                        className="px-2 py-2 text-[12px] text-center"
                        style={{
                          width: STAGE_COL_WIDTH,
                          minWidth: STAGE_COL_WIDTH,
                        }}
                      >
                        {c.short}
                      </Th>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {groups.map((g) => (
                    <QualityRows
                      key={g.key}
                      group={g}
                      open={expanded.has(g.key)}
                      selectedId={selectedId}
                      flashId={flashId}
                      onToggle={() => toggleGroup(g.key)}
                      onSelect={setSelectedId}
                    />
                  ))}
                </TBody>
              </Table>
            </HScroll>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <span className="num text-xs text-text-2">
                {totalOrders} order{totalOrders === 1 ? "" : "s"}
              </span>
              <Pager
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                disabled={q.isFetching}
              />
            </div>
          ) : null}
        </Card>

        {hasSelection ? (
          <div
            ref={panelRef}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            // Double-click the bar (or anywhere on the frame) snaps it back to
            // the default corner.
            onDoubleClick={() => setPanelPos(null)}
            style={
              panelPos
                ? { left: panelPos.x, top: panelPos.y }
                : { right: 24, top: 104 }
            }
            className="fixed z-30 flex max-h-[calc(100vh-8rem)] w-[min(94vw,520px)] flex-col overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xl"
          >
            <TrackerDetail
              line={selected}
              group={selectedGroup}
              order={selectedOrder}
              index={index}
              total={lines.length}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onSelectLine={setSelectedId}
              onClose={() => setSelectedId(null)}
              onDragStart={startDrag}
              onGoToRow={goToRow}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// One quality, with a cell per stage showing how many of its designs are
// through it; opening it lists those designs (the colours) a row each.
function QualityRows({
  group,
  open,
  selectedId,
  flashId,
  onToggle,
  onSelect,
}: {
  group: QualityGroup;
  open: boolean;
  selectedId: string | null;
  flashId: string | null;
  onToggle: () => void;
  onSelect: (lineId: string) => void;
}) {
  const holdsSelection = group.lines.some((l) => l.lineId === selectedId);

  return (
    <>
      <Tr
        data-group-key={group.key}
        onClick={() => onSelect(group.lines[0].lineId)}
        title={`${TONE_LABEL[group.tone]} — click for full details`}
        className={cn(
          "cursor-pointer text-text-1",
          // Background stays neutral; the STATUS is the text colour.
          holdsSelection ? SELECTED_ROW : "bg-surface hover:bg-surface-2",
        )}
      >
        <Td
          className={cn(stickyCell, "num font-semibold", TONE_TEXT[group.tone])}
          style={{ left: 0, width: W_ORDER, minWidth: W_ORDER }}
        >
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                // The row's own click SELECTS; the chevron only expands.
                e.stopPropagation();
                onToggle();
              }}
              aria-label={open ? "Hide colours" : "Show colours"}
              aria-expanded={open}
              className="-ml-1 rounded p-0.5 opacity-60 hover:bg-chip hover:opacity-100"
            >
              <IconChevronRight
                className={cn("size-3.5 transition-transform", open && "rotate-90")}
              />
            </button>
            {group.orderNo}
          </span>
        </Td>
        <Td
          className={cn(stickyCell, "truncate", TONE_TEXT[group.tone])}
          style={{ left: L_PARTY, width: W_PARTY, minWidth: W_PARTY }}
          title={group.party}
        >
          {group.party}
        </Td>
        <Td
          className={cn(stickyCell, "truncate font-medium", TONE_TEXT[group.tone])}
          style={{ left: L_QUALITY, width: W_QUALITY, minWidth: W_QUALITY }}
          title={group.fabric}
        >
          {group.fabric}
        </Td>
        <Td className="num px-2.5 py-2 whitespace-nowrap">
          {formatDate(group.odDate)}
        </Td>
        <Td className="num px-2.5 py-2 text-right whitespace-nowrap">
          {group.lines.length}
        </Td>
        <Td
          className={cn(
            "num px-2.5 py-2 text-right font-medium whitespace-nowrap",
            TONE_TEXT[group.tone],
          )}
        >
          {formatNumber(group.qtyTotal)}
        </Td>
        <Td className="px-2.5 py-2 whitespace-nowrap">
          {group.salesPerson || "—"}
        </Td>
        <Td
          className={cn(
            "px-2.5 py-2 font-semibold whitespace-nowrap",
            TONE_TEXT[group.tone],
          )}
        >
          {TONE_LABEL[group.tone]}
        </Td>
        {STAGE_COLUMNS.map((c) => (
          <Td
            key={c.key}
            className="px-2 py-2 text-center"
            style={{ width: STAGE_COL_WIDTH, minWidth: STAGE_COL_WIDTH }}
          >
            <StageCell lines={group.lines} stageKey={c.key} label={c.full} />
          </Td>
        ))}
      </Tr>

      {open
        ? group.lines.map((l) => (
            <ColourRow
              key={l.lineId}
              line={l}
              selected={l.lineId === selectedId}
              flashed={l.lineId === flashId}
              onSelect={() => onSelect(l.lineId)}
            />
          ))
        : null}
    </>
  );
}

function ColourRow({
  line,
  selected,
  flashed,
  onSelect,
}: {
  line: OrderStatusRow;
  selected: boolean;
  flashed?: boolean;
  onSelect: () => void;
}) {
  const tone = toneOfLines([line]);
  return (
    <Tr
      data-line-id={line.lineId}
      onClick={onSelect}
      title={`${TONE_LABEL[tone]} — click for full details`}
      className={cn(
        "cursor-pointer text-text-2",
        flashed
          ? FLASH_ROW
          : selected
            ? SELECTED_ROW
            : "bg-surface-2 hover:bg-surface-3",
      )}
    >
      <Td className={stickyCell} style={{ left: 0, width: W_ORDER, minWidth: W_ORDER }} />
      <Td
        className={stickyCell}
        style={{ left: L_PARTY, width: W_PARTY, minWidth: W_PARTY }}
      />
      <Td
        className={cn(stickyCell, "num truncate font-medium", TONE_TEXT[tone])}
        style={{ left: L_QUALITY, width: W_QUALITY, minWidth: W_QUALITY }}
        title={`Design ${line.design}`}
      >
        <span className={cn("pl-5", line.isCancelled && "line-through")}>
          {line.design}
        </span>
      </Td>
      <Td className="px-2.5 py-1.5" />
      <Td className="px-2.5 py-1.5" />
      <Td
        className={cn(
          "num px-2.5 py-1.5 text-right font-medium whitespace-nowrap",
          TONE_TEXT[tone],
        )}
      >
        {formatNumber(Number(line.qtyMtr))}
      </Td>
      <Td className="px-2.5 py-1.5" />
      <Td
        className={cn(
          "px-2.5 py-1.5 font-semibold whitespace-nowrap",
          TONE_TEXT[tone],
        )}
      >
        {TONE_LABEL[tone]}
      </Td>
      {STAGE_COLUMNS.map((c) => (
        <Td
          key={c.key}
          className="px-2 py-1.5 text-center"
          style={{ width: STAGE_COL_WIDTH, minWidth: STAGE_COL_WIDTH }}
        >
          <StageCell lines={[line]} stageKey={c.key} label={c.full} />
        </Td>
      ))}
    </Tr>
  );
}
