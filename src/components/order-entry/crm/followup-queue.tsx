"use client";

// The follow-up queue — docs/SCREENS.md §7.1
//
// The daily work queue. **Ranked by priority, not by date**: a coordinator
// clearing 40 calls should reach the ₹18 L late order before the ₹40 K clean
// one. The ranking itself lives in `lib/order-entry/crm.ts` and nowhere else.
//
// Shared CRM behaviours (§7.0) that this screen carries like the other three
// lists: every KPI tile is a filter whose key is sent to the SERVER (so the
// count and the rows can never disagree), search is live at 250 ms, `page`
// resets on any filter change, and `placeholderData` keeps the table from
// blinking to empty on a refetch.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconPhoneCall,
  IconPhoneOff,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";

import {
  PRIORITY_LABEL,
  type FollowupList,
  type FollowupRow,
  type FollowupSort,
} from "@/lib/order-entry/crm";
import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import { cn } from "@/lib/utils";
import { HScroll } from "@/components/ui/hscroll";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { StatCard, type StatTone } from "@/components/ui/stat-card";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { apiGet } from "./api-client";
import { FollowupPanel, type PanelRow } from "./followup-panel";
import { Pill, PriorityBar, StatusPill } from "./pill";
import { Stars } from "./stars";

type Range = "today" | "7" | "30" | "month" | "all" | "custom";

const selectCls =
  "h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const SORTS: { value: FollowupSort; label: string }[] = [
  { value: "priority", label: "Worst first" },
  { value: "oldest", label: "Oldest first" },
  { value: "value", label: "Highest value" },
];

const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All" },
  { value: "custom", label: "Pick dates…" },
];

/** `all` returns null — no date params at all, not a window covering everything. */
function rangeToDates(r: Range): { from: string; to: string } | null {
  if (r === "all") return null;
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (r === "today") return { from: to, to };
  if (r === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: first.toISOString().slice(0, 10), to };
  }
  const days = r === "7" ? 7 : 30;
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to };
}

type KpiKey =
  "dueToday" | "overdue" | "inProgress" | "completed30d" | "unreachable";

export function FollowupQueue({ canEdit }: { canEdit: boolean }) {
  const [range, setRange] = React.useState<Range>("all");
  // ── A PERIOD SOMEBODY CHOOSES, NOT ONE OF FIVE WE CHOSE ────────────────
  //
  // The five presets answer "recently"; they cannot answer "what was waiting
  // in August". Both boxes are OPTIONAL and either one alone works — a `from`
  // with no `to` is everything since that date, which is what somebody
  // reaching for a date filter usually means. Debounced, because a date input
  // fires on every keystroke of a typed year.
  const [fromInput, setFromInput] = React.useState("");
  const [toInput, setToInput] = React.useState("");
  const [sort, setSort] = React.useState<FollowupSort>("priority");
  const [rawSearch, setRawSearch] = React.useState("");
  const [kpi, setKpi] = React.useState<KpiKey | null>(null);
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Live as you type. A slow round trip must never read as "press Enter".
  const search = useDebouncedValue(rawSearch, 250);
  const customFrom = useDebouncedValue(fromInput, 350);
  const customTo = useDebouncedValue(toInput, 350);

  // A backwards range returns nothing and then announces a period that runs
  // backwards. The export route and the dashboards both swap it rather than
  // arguing; this is another entry point and it does the same.
  const custom =
    customFrom && customTo && customFrom > customTo
      ? { from: customTo, to: customFrom }
      : { from: customFrom, to: customTo };

  const dates: { from?: string; to?: string } | null =
    range === "custom"
      ? custom.from || custom.to
        ? custom
        : null
      : rangeToDates(range);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("sort", sort);
  // The tile's key is sent AS-IS. The server applies the very same predicate it
  // used to compute that tile's number, so the count and the rows always agree
  // — and total, totalPages and the pager stay correct. Filtering client-side
  // would make the tile lie the moment the set spanned more than one page.
  if (kpi) params.set("kpi", kpi);
  if (search) params.set("q", search);
  if (dates) {
    if (dates.from) params.set("from", dates.from);
    if (dates.to) params.set("to", dates.to);
  }
  const qs = params.toString();

  const q = useQuery({
    queryKey: ["crm-followups", qs],
    queryFn: () => apiGet<FollowupList>(`/api/crm/followups?${qs}`),
    placeholderData: (prev) => prev,
  });

  // Reset to page 1 whenever the filters change under our feet.
  React.useEffect(() => {
    setPage(1);
  }, [range, sort, search, kpi, customFrom, customTo]);

  const data = q.data;
  const rows = data?.rows ?? [];
  const k = data?.kpis;
  const selected = rows.find((r) => r.id === openId) ?? null;

  const cards: {
    key: KpiKey;
    label: string;
    value: number;
    tone: StatTone;
    icon: React.ReactNode;
  }[] = [
    {
      key: "dueToday",
      label: "Due",
      value: k?.dueToday ?? 0,
      tone: "accent",
      icon: <IconClock />,
    },
    {
      key: "overdue",
      label: "Call overdue",
      value: k?.overdue ?? 0,
      tone: "danger",
      icon: <IconAlertTriangle />,
    },
    {
      key: "inProgress",
      label: "In progress",
      value: k?.inProgress ?? 0,
      tone: "warning",
      icon: <IconPhoneCall />,
    },
    {
      key: "completed30d",
      label: "Completed (30d)",
      value: k?.completed30d ?? 0,
      tone: "success",
      icon: <IconCircleCheck />,
    },
    {
      key: "unreachable",
      label: "Unreachable",
      value: k?.unreachable ?? 0,
      tone: "neutral",
      icon: <IconPhoneOff />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Region A — every tile is a filter. A tile that only reads is a tile you
          cannot act on; a tile you cannot clear is a trap. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
        {cards.map((c) => {
          const active = kpi === c.key;
          return (
            <StatCard
              key={c.key}
              icon={c.icon}
              label={c.label}
              value={c.value}
              tone={c.tone}
              sub={active ? "Filtering — click to clear" : undefined}
              active={active}
              onClick={() => setKpi(active ? null : c.key)}
              aria-label={
                active
                  ? `Showing only ${c.label.toLowerCase()} — click to clear`
                  : `Show only ${c.label.toLowerCase()}`
              }
              className="h-full"
            />
          );
        })}
      </div>

      {/* Region B — the filters sit BELOW the KPIs: the tiles are the first
          read, and a row of controls above them delayed that. Five range chips
          and a three-way sort became two dropdowns, which is one row on a phone
          rather than three. Search gets its own full-width row on a phone
          (`sm:contents` folds the rest back into one line once there's room),
          the same pattern `customers-view.tsx` in this folder already uses. */}
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-2.5 shadow-sm sm:flex-row sm:items-center">
        <div className="relative w-full sm:min-w-[220px] sm:flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-2" />
          <Input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Search order no or party…"
            aria-label="Search"
            className="h-9 pl-8"
          />
        </div>

        <div className="flex items-center gap-2 sm:contents">
          <select
            className={cn(selectCls, "flex-1 sm:flex-none")}
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {/*
            Shown only while "Pick dates…" is the selection. Two date boxes
            sitting permanently beside five presets that already answer the
            common questions is four controls doing one job.
          */}
          {range === "custom" ? (
            <>
              <input
                type="date"
                className={cn(selectCls, "num flex-1 sm:flex-none")}
                value={fromInput}
                max={toInput || undefined}
                onChange={(e) => setFromInput(e.target.value)}
                aria-label="From date"
              />
              <span className="shrink-0 text-[12.5px] text-text-2">–</span>
              <input
                type="date"
                className={cn(selectCls, "num flex-1 sm:flex-none")}
                value={toInput}
                min={fromInput || undefined}
                onChange={(e) => setToInput(e.target.value)}
                aria-label="To date"
              />
              {fromInput || toInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setFromInput("");
                    setToInput("");
                  }}
                  className="shrink-0 cursor-pointer text-[12.5px] font-medium text-text-2 underline underline-offset-2 hover:text-text-1"
                >
                  Clear
                </button>
              ) : null}
            </>
          ) : null}

          <select
            className={cn(selectCls, "flex-1 sm:flex-none")}
            value={sort}
            onChange={(e) => setSort(e.target.value as FollowupSort)}
            aria-label="Sort"
          >
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void q.refetch()}
            title="Refresh"
            aria-label="Refresh"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1"
          >
            <IconRefresh
              className={cn("size-4", q.isFetching && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Region C — the queue itself. */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {/* ONE line. A title over a two-line paragraph above a card holding a
            single row spent a quarter of the screen explaining itself. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-2.5 sm:px-5">
          <h2 className="text-[15px] font-semibold text-text-1">
            Priority queue
          </h2>
          {data ? (
            <span className="num rounded-pill bg-chip px-2 py-0.5 text-[11.5px] font-semibold text-text-2">
              {data.total}
              {data.created > 0 ? ` · ${data.created} new` : ""}
            </span>
          ) : null}
          <span
            className="hidden text-[11.5px] text-text-2 sm:inline"
            title="Ranked by order value, our own delay and prior complaints — not by date."
          >
            click a row to work it
          </span>
        </div>

        {/* Three distinct states, never conflated: a failed request must
            never render as "no results" — they look identical to the
            operator and one of them is a bug. Shared between the table and
            the mobile card list below rather than duplicated per view. */}
        {q.isLoading ? (
          <p className="px-4 py-10 text-center text-text-2">Loading…</p>
        ) : q.isError ? (
          <div className="px-4 py-10 text-center">
            <div className="font-semibold text-status-red">
              Could not load the follow-up queue
            </div>
            <div className="mx-auto mt-1 max-w-[60ch] text-[12.5px] text-text-2">
              {(q.error as Error)?.message ?? "Unknown error"}
            </div>
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="mt-3 cursor-pointer rounded-field border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-text-2 hover:bg-chip hover:text-text-1"
            >
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-text-2">
            No follow-ups match these filters.
          </p>
        ) : (
          <>
            {/* Desktop / tablet: the full table. Hidden on the OUTER wrapper,
                not just the body — HScroll renders its own synced scrollbar
                strip above the header on that wrapper, which would otherwise
                still show as a dead strip on mobile. */}
            <HScroll
              className="hidden lg:block"
              bodyClassName="overflow-x-auto"
            >
              <Table>
                <THead>
                  <tr>
                    <Th className="w-[14px] px-2" />
                    <Th>Order no</Th>
                    <Th className="w-full">Party</Th>
                    <Th>Delivered</Th>
                    <Th className="text-right">Waiting</Th>
                    <Th className="text-right">Order value</Th>
                    <Th>Our SLA</Th>
                    <Th className="text-right">Attempts</Th>
                    <Th>Follow-up</Th>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <QueueRow
                      key={r.id}
                      row={r}
                      selected={r.id === openId}
                      onOpen={() => setOpenId(r.id)}
                    />
                  ))}
                </TBody>
              </Table>
            </HScroll>

            {/* Mobile: one card per follow-up, worst first, same as the
                table's row order — tapping it opens the same panel. */}
            <div className="flex flex-col divide-y divide-border lg:hidden">
              {rows.map((r) => (
                <QueueCard
                  key={r.id}
                  row={r}
                  selected={r.id === openId}
                  onOpen={() => setOpenId(r.id)}
                />
              ))}
            </div>
          </>
        )}

        {data && data.totalPages > 1 ? (
          <div className="border-t border-border px-4 py-2.5">
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onPageChange={setPage}
              disabled={q.isFetching}
            />
          </div>
        ) : null}
      </div>

      {selected ? (
        <FollowupPanel
          followupId={selected.id}
          row={toPanelRow(selected)}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onSaved={() => void q.refetch()}
        />
      ) : null}
    </div>
  );
}

function toPanelRow(r: FollowupRow): PanelRow {
  return {
    orderNo: r.orderNo,
    partyName: r.partyName,
    orderValue: r.orderValue,
    daysWaiting: r.daysWaiting,
    qualities: r.qualities,
    designs: r.designs,
    qtyMtr: r.qtyMtr,
    hadOutOfStock: r.hadOutOfStock,
    hadCancellation: r.hadCancellation,
  };
}

function QueueRow({
  row,
  selected,
  onOpen,
}: {
  row: FollowupRow;
  selected: boolean;
  onOpen: () => void;
}) {
  const overdue = row.daysOverdue > 0;
  return (
    <Tr
      onClick={onOpen}
      className={cn("cursor-pointer", selected && "bg-accent hover:bg-accent")}
    >
      <Td className="px-2">
        <PriorityBar band={row.band} label={PRIORITY_LABEL[row.band]} />
      </Td>
      <Td className="num font-semibold whitespace-nowrap text-text-1">
        {row.orderNo}
        {row.isEscalated ? (
          <IconAlertTriangle
            className="ml-1.5 inline size-3.5 align-[-2px] text-status-red"
            aria-label="Escalated for review"
          />
        ) : null}
      </Td>
      <Td className="max-w-[260px]">
        <div className="truncate font-semibold text-text-1">
          {row.partyName}
        </div>
        <div className="truncate text-[12px] text-text-2">
          {row.qualities} quality{row.qualities === 1 ? "" : "s"} ·{" "}
          {row.designs} design{row.designs === 1 ? "" : "s"}
          {row.transport ? ` · ${row.transport}` : ""}
        </div>
      </Td>
      <Td className="num whitespace-nowrap text-text-2">
        {formatDate(row.deliveredAt)}
      </Td>
      <Td className="num text-right whitespace-nowrap">{row.daysWaiting} d</Td>
      <Td className="num text-right font-semibold whitespace-nowrap">
        {row.orderValue > 0 ? `₹${formatNumber(row.orderValue)}` : "—"}
      </Td>
      <Td>
        {/* OUR verdict, and it is not the customer's (§7.1.3). The customer's
            answer is captured on the call, in stage 2, and the two disagree
            constantly — that disagreement is the finding. */}
        {row.systemOnTime === null ? (
          <span className="text-text-2">—</span>
        ) : row.systemOnTime ? (
          <Pill tone="done">On time</Pill>
        ) : (
          <Pill tone="late">Late</Pill>
        )}
      </Td>
      <Td className="num text-right">{row.attemptCount}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <StatusPill status={row.status} overdue={overdue} />
          {row.ratingOverall ? <Stars value={row.ratingOverall} /> : null}
          {row.openIssues > 0 ? (
            <Pill tone="warn" dot={false}>
              {row.openIssues} issue{row.openIssues === 1 ? "" : "s"}
            </Pill>
          ) : null}
        </div>
      </Td>
    </Tr>
  );
}

/** The mobile stand-in for `QueueRow` — same fields, one card each, the
 * priority bar running down the left edge exactly as it does in the table. */
function QueueCard({
  row,
  selected,
  onOpen,
}: {
  row: FollowupRow;
  selected: boolean;
  onOpen: () => void;
}) {
  const overdue = row.daysOverdue > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-stretch gap-2.5 px-3 py-2.5 text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-surface-2",
      )}
    >
      <PriorityBar band={row.band} label={PRIORITY_LABEL[row.band]} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num font-semibold whitespace-nowrap text-text-1">
            {row.orderNo}
            {row.isEscalated ? (
              <IconAlertTriangle
                className="ml-1.5 inline size-3.5 align-[-2px] text-status-red"
                aria-label="Escalated for review"
              />
            ) : null}
          </span>
          <span className="num shrink-0 text-[13px] font-semibold text-text-1">
            {row.orderValue > 0 ? `₹${formatNumber(row.orderValue)}` : "—"}
          </span>
        </div>
        <div className="truncate text-[13px] font-medium text-text-1">
          {row.partyName}
        </div>
        <div className="truncate text-[12px] text-text-2">
          {row.qualities} quality{row.qualities === 1 ? "" : "s"} ·{" "}
          {row.designs} design{row.designs === 1 ? "" : "s"}
          {row.transport ? ` · ${row.transport}` : ""}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StatusPill status={row.status} overdue={overdue} />
          {row.ratingOverall ? <Stars value={row.ratingOverall} /> : null}
          {row.openIssues > 0 ? (
            <Pill tone="warn" dot={false}>
              {row.openIssues} issue{row.openIssues === 1 ? "" : "s"}
            </Pill>
          ) : null}
          <span className="ml-auto text-[11.5px] text-text-3">
            {formatDate(row.deliveredAt)} · {row.daysWaiting}d waiting
          </span>
        </div>
      </div>
    </button>
  );
}
