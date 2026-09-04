"use client";

// The complaint board — docs/SCREENS.md §7.3
//
// **Every issue points at a LINE**, so this list is also the raw material for
// defect rate by fabric, design, transport and month — which a text field
// answers none of.
//
// Three column decisions carry their own reasoning:
//   * **The complaint column shows the description.** The board previously
//     showed the category and hid the description entirely — so a list of
//     complaints never said what anyone actually complained about.
//   * **"Order amount"**, because a shortage on a ₹40 K order and one on a
//     ₹18 L order are not the same problem.
//   * **"Department", not "Owner"** — *"Owner: TRANSPORT"* read as the transport
//     company. It is the department that has to FIX it.
//
// Uniquely on this screen the filter bar sits ABOVE the tiles: its status tabs
// are the primary control.

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconClock,
  IconCurrencyRupee,
  IconFilter,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";

import {
  ISSUE_RESOLUTIONS,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  OWNER_DEPTS,
  categoryLabel,
  type IssueList,
  type IssueResolution,
  type IssueRow,
} from "@/lib/order-entry/crm";
import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HScroll } from "@/components/ui/hscroll";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { apiGet, apiSend } from "./api-client";
import { Pill } from "./pill";

const STATUS_TABS = [
  { value: "OPEN_ANY", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ALL", label: "All" },
] as const;

const selectCls =
  "h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

// The department that has to act. The raw enum (OPS / DISPATCH / ACCOUNTS) is
// shouted and ambiguous in a cell on its own.
export const DEPT_LABEL: Record<string, string> = {
  OPS: "Operations",
  DISPATCH: "Dispatch",
  DESIGN: "Design",
  ACCOUNTS: "Accounts",
  TRANSPORT: "Transport",
  SALES: "Sales",
};

function money(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${formatNumber(n)}`;
}

const SEVERITY_TONE = { HIGH: "late", MEDIUM: "warn", LOW: "due" } as const;
const SEVERITY_LABEL = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" } as const;
const STATUS_TONE = {
  OPEN: "due",
  IN_PROGRESS: "progress",
  RESOLVED: "done",
  REJECTED: "warn",
} as const;
const STATUS_TEXT = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
} as const;
const RESOLUTION_LABEL: Record<IssueResolution, string> = {
  CREDIT_NOTE: "Credit note",
  REPLACEMENT: "Replacement",
  REPRINT: "Reprint",
  DISCOUNT: "Discount",
  EXPLAINED: "Explained",
  NO_ACTION: "No action",
};

/**
 * A managed vocabulary (§7.0): `/api/order-entry/lookups` returns a plain
 * `string[]` unless you pass `?all=1` — typing it as `{value}[]` yields
 * `[undefined]` and crashes on mount (§8.8).
 *
 * `restrictTo` keeps the department filter to values the write schemas can
 * actually store, and `fallback` covers the empty master list an admin has not
 * populated in Settings → CRM yet.
 */
function useLookupList(
  category: string,
  fallback: readonly string[] = [],
  restrictTo?: readonly string[],
) {
  const q = useQuery({
    queryKey: ["lookups", category],
    queryFn: () =>
      apiGet<string[]>(
        `/api/order-entry/lookups?category=${encodeURIComponent(category)}`,
      ),
    staleTime: 5 * 60_000,
  });
  return React.useMemo(() => {
    let values = (q.data ?? []).filter((v): v is string => !!v);
    if (restrictTo) values = values.filter((v) => restrictTo.includes(v));
    return values.length > 0 ? values : [...fallback];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
}

export function IssuesBoard({
  canEdit,
  from,
  to,
}: {
  canEdit: boolean;
  // The raised-date window. Owned by the page (its trigger sits top-right,
  // beside the title) so the board's own rows stay pure status/category/
  // severity/owner/search — the window is a rarer refinement, not a row.
  from: string;
  to: string;
}) {
  // Deep links land here from the call log, where an issue COUNT is a link.
  // Read ONCE, as the initial state — after that the controls own them, so
  // changing a filter does not fight the URL.
  const sp = useSearchParams();
  const initialQ = sp.get("q") ?? "";
  const initialStatus = sp.get("status") ?? "OPEN_ANY";
  const initialDept = sp.get("dept") ?? "";
  const initialSeverity = sp.get("severity") ?? "";

  const categories = useLookupList("CRM_ISSUE");
  const depts = useLookupList("CRM_DEPT", OWNER_DEPTS, OWNER_DEPTS);

  const [status, setStatus] = React.useState<string>(initialStatus);
  const [category, setCategory] = React.useState("");
  const [severity, setSeverity] = React.useState(initialSeverity);
  const [dept, setDept] = React.useState(initialDept);
  const [groupBy, setGroupBy] = React.useState<"dept" | "category">("dept");
  const [rawSearch, setRawSearch] = React.useState(initialQ);
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  const search = useDebouncedValue(rawSearch, 250);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("status", status);
  if (category) params.set("category", category);
  if (severity) params.set("severity", severity);
  if (dept) params.set("dept", dept);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search) params.set("q", search);
  const qs = params.toString();

  const q = useQuery({
    queryKey: ["crm-issues", qs],
    queryFn: () => apiGet<IssueList>(`/api/crm/issues?${qs}`),
    placeholderData: (prev) => prev,
  });

  React.useEffect(() => {
    setPage(1);
  }, [status, category, severity, dept, from, to, search]);

  const data = q.data;
  const rows = data?.rows ?? [];
  const k = data?.kpis;

  // Each tile narrows the board to what it counts, and clicking the active one
  // puts it back. The status chips above stay in sync because they read the
  // same state.
  const openish = status === "OPEN_ANY" && !severity;
  const showOpen = () => {
    setStatus("OPEN_ANY");
    setSeverity("");
  };
  const showHighSeverity = () => {
    if (severity === "HIGH") {
      setSeverity("");
      return;
    }
    setStatus("OPEN_ANY");
    setSeverity("HIGH");
  };
  const showResolved = () => {
    setSeverity("");
    setStatus(status === "RESOLVED" ? "OPEN_ANY" : "RESOLVED");
  };

  const groups = groupBy === "dept" ? (data?.byDept ?? []) : (data?.byCategory ?? []);
  const hasSecondaryFilters = !!(
    (status && status !== "OPEN_ANY") ||
    category ||
    severity ||
    dept
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Region A — KPI tiles, first thing on the screen. Each `sub` switches
          between the imperative and the present tense, so the tile says
          whether it is currently in force. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconAlertTriangle />}
          label="Open issues"
          value={k?.open ?? 0}
          sub={openish ? "showing open" : "show open only"}
          tone="danger"
          active={openish}
          onClick={showOpen}
        />
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconCurrencyRupee />}
          label="Value at risk"
          value={k ? `₹${formatNumber(k.valueAtRisk)}` : "—"}
          tone="warning"
          sub={openish ? "counted once per order" : "show the open ones"}
          active={openish}
          onClick={showOpen}
        />
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconClock />}
          label="Median resolution"
          value={
            k?.medianResolutionDays != null ? `${k.medianResolutionDays} d` : "—"
          }
          tone="neutral"
          sub={
            status === "RESOLVED"
              ? "showing resolved"
              : k?.medianResolutionDays == null
                ? "nothing resolved yet"
                : "see the resolved ones"
          }
          active={status === "RESOLVED"}
          onClick={showResolved}
        />
        <StatCard
          className="py-2.5 sm:py-3"
          icon={<IconAlertCircle />}
          label="High severity"
          value={k?.highSeverity ?? 0}
          tone="danger"
          sub={severity === "HIGH" ? "showing high only" : "show high only"}
          active={severity === "HIGH"}
          onClick={showHighSeverity}
        />
      </div>

      {/* Region B — search stays visible; everything else (status, category,
          severity, owner) collapses behind Filters, the same toggle-and-
          expand pattern the Orders screen uses. The raised-date window lives
          in the page header, so it never needs a row here at all. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-2" />
            <Input
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Order, party, quality or design…"
              aria-label="Search"
              className="h-9 pl-8"
            />
          </div>

          <Button
            variant="outline"
            onClick={() => setShowFilters((s) => !s)}
            aria-pressed={showFilters}
          >
            <IconFilter className="size-4" /> Filters
            {hasSecondaryFilters ? (
              <span className="ml-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </Button>

          <button
            type="button"
            onClick={() => void q.refetch()}
            title="Refresh"
            aria-label="Refresh"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1"
          >
            <IconRefresh className={cn("size-4", q.isFetching && "animate-spin")} />
          </button>
        </div>

        {showFilters ? (
          <div className="flex flex-col gap-3 rounded-field border border-border bg-surface-2 p-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                Status
                <select
                  className={cn(selectCls, "w-full")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_TABS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                Category
                <select
                  className={cn(selectCls, "w-full")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                Severity
                <select
                  className={cn(selectCls, "w-full")}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">All severities</option>
                  {ISSUE_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                Owner
                <select
                  className={cn(selectCls, "w-full")}
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                >
                  <option value="">Anyone&rsquo;s to fix</option>
                  {depts.map((dp) => (
                    <option key={dp} value={dp}>
                      {DEPT_LABEL[dp] ?? dp}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {hasSecondaryFilters ? (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatus("OPEN_ANY");
                    setCategory("");
                    setSeverity("");
                    setDept("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Region C — the board. */}
      <div className="grid gap-3 lg:grid-cols-[232px_1fr]">
        {/* The group-by rail doubles as a filter, and its two modes answer
            different questions: BY DEPARTMENT is who has to act, BY CATEGORY is
            what keeps happening. Desktop-only — on a phone this is a whole
            extra card just for a toggle and (usually) "nothing to break down
            yet"; department and category are still reachable from Filters. */}
        <div className="hidden h-fit rounded-card border border-border bg-surface lg:block">
          <div className="px-3 pt-3 pb-2">
            <Segmented
              size="sm"
              className="w-full"
              label="Group by"
              value={groupBy}
              onChange={(v) => setGroupBy(v as "dept" | "category")}
              options={[
                { value: "dept", label: "By who fixes it" },
                { value: "category", label: "By category" },
              ]}
            />
          </div>
          <div className="px-2 pb-3">
            {groups.length === 0 ? (
              <p className="px-2 py-3 text-[12.5px] text-text-2">
                Nothing to break down yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {groups.map((g) => {
                  const active =
                    groupBy === "dept" ? dept === g.key : category === g.key;
                  const label =
                    groupBy === "dept"
                      ? (DEPT_LABEL[g.key] ?? g.key)
                      : categoryLabel(g.key);
                  return (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() => {
                          if (groupBy === "dept") setDept(active ? "" : g.key);
                          else setCategory(active ? "" : g.key);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-left text-[12.5px] transition-colors",
                          active
                            ? "bg-accent font-semibold text-accent-text"
                            : "text-text-2 hover:bg-chip hover:text-text-1",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <span className="num shrink-0 font-semibold">
                          {g.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2.5 sm:px-5">
            <h2 className="text-[15px] font-semibold text-text-1">Complaints</h2>
            {data ? (
              <span className="num rounded-pill bg-chip px-2 py-0.5 text-[12px] font-semibold text-text-2">
                {data.total}
              </span>
            ) : null}
            <span className="text-[12px] text-text-2">
              worst first · click a row to resolve
            </span>
          </div>

          <HScroll bodyClassName="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <Th>Order no</Th>
                  <Th>Party name</Th>
                  <Th className="w-full">Complaint</Th>
                  <Th>Fabric</Th>
                  <Th>Design no</Th>
                  <Th className="text-right">Meters affected</Th>
                  <Th className="text-right">Order amount</Th>
                  <Th>How serious</Th>
                  <Th>Department</Th>
                  <Th className="text-right">Days open</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {q.isLoading ? (
                  <tr>
                    <Td colSpan={11} className="px-4 py-10 text-center text-text-2">
                      Loading…
                    </Td>
                  </tr>
                ) : q.isError ? (
                  <tr>
                    <Td colSpan={11} className="px-4 py-10 text-center">
                      <div className="font-semibold text-status-red">
                        Could not load issues
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
                    </Td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <Td colSpan={11} className="px-4 py-12 text-center">
                      <div className="text-[13.5px] font-medium text-text-1">
                        No complaints recorded.
                      </div>
                      {/* An empty board here is a real state, not a bug — say
                          which, or it reads as broken. */}
                      <div className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-[1.6] text-text-2">
                        Issues are raised during a call, from the follow-up panel
                        on CRM → Follow-ups. Open a follow-up, work through
                        &ldquo;The call&rdquo;, and press{" "}
                        <strong>+ Add issue</strong>.
                      </div>
                    </Td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <IssueRowView
                      key={r.id}
                      row={r}
                      open={openId === r.id}
                      canEdit={canEdit}
                      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                      onSaved={() => {
                        setOpenId(null);
                        void q.refetch();
                      }}
                    />
                  ))
                )}
              </TBody>
            </Table>
          </HScroll>

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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function IssueRowView({
  row,
  open,
  canEdit,
  onToggle,
  onSaved,
}: {
  row: IssueRow;
  open: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const closed = row.status === "RESOLVED" || row.status === "REJECTED";
  const [resolution, setResolution] = React.useState<IssueResolution>(
    row.resolution ?? "EXPLAINED",
  );
  const [note, setNote] = React.useState(row.resolutionNote ?? "");
  const [nextStatus, setNextStatus] = React.useState<string>(
    closed ? row.status : "RESOLVED",
  );
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiSend(`/api/crm/issues/${row.id}`, "PATCH", {
        status: nextStatus,
        // Only sent when CLOSING — the schema requires a resolution for
        // RESOLVED and would reject a bare status change carrying a stale one.
        resolution: nextStatus === "RESOLVED" ? resolution : null,
        resolution_note: note || null,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <Tr
        onClick={onToggle}
        className={cn("cursor-pointer", open && "bg-accent hover:bg-accent")}
      >
        <Td className="num text-[13px] font-semibold whitespace-nowrap text-text-1">
          {row.orderNo}
        </Td>
        <Td className="max-w-[200px] truncate text-[12.5px] font-medium text-text-1">
          {row.partyName}
        </Td>

        {/* The complaint itself, description and all. */}
        <Td className="max-w-0">
          <div className="truncate text-[13px] font-medium text-text-1">
            {categoryLabel(row.category)}
          </div>
          {row.description ? (
            <div
              className="truncate text-[12.5px] font-medium text-text-2"
              title={row.description}
            >
              {row.description}
            </div>
          ) : (
            <div className="text-[12px] text-text-2 italic">
              no detail recorded
            </div>
          )}
        </Td>

        <Td className="max-w-[160px] truncate text-[12.5px] font-medium text-text-1">
          {row.quality ?? (
            <span className="font-normal text-text-2">Whole order</span>
          )}
        </Td>
        <Td className="num text-[12.5px] text-text-1">
          {row.designNo ?? <span className="text-text-2">—</span>}
        </Td>

        <Td className="num text-right whitespace-nowrap">
          {row.qtyAffected != null ? (
            <span className="font-medium">{formatNumber(row.qtyAffected)}</span>
          ) : (
            <span className="text-text-2">—</span>
          )}
        </Td>

        <Td className="num text-right whitespace-nowrap">
          {row.orderValue > 0 ? (
            <span className="font-semibold">{money(row.orderValue)}</span>
          ) : (
            <span className="text-text-2">—</span>
          )}
        </Td>

        <Td>
          <Pill tone={SEVERITY_TONE[row.severity]}>
            {SEVERITY_LABEL[row.severity]}
          </Pill>
        </Td>

        <Td>
          {row.ownerDept ? (
            <span className="inline-flex items-center rounded-md bg-chip px-2 py-[3px] text-[11.5px] font-semibold tracking-wide text-text-2">
              {DEPT_LABEL[row.ownerDept] ?? row.ownerDept}
            </span>
          ) : (
            <span className="text-text-2">unassigned</span>
          )}
        </Td>

        {/* Age stops at resolution, so a complaint closed in two days does not
            read as ninety days old six months later. */}
        <Td className="num text-right whitespace-nowrap">
          <span
            className={cn(
              "font-medium",
              !closed && row.ageDays >= 14
                ? "text-status-red"
                : !closed && row.ageDays >= 7
                  ? "text-status-amber"
                  : "text-text-2",
            )}
          >
            {row.ageDays}d
          </span>
        </Td>

        <Td>
          <Pill tone={STATUS_TONE[row.status]} dot={false}>
            {STATUS_TEXT[row.status]}
          </Pill>
          {row.resolution ? (
            <div className="mt-0.5 text-[11.5px] text-text-2">
              {RESOLUTION_LABEL[row.resolution]}
            </div>
          ) : null}
        </Td>
      </Tr>

      {open ? (
        <tr className="border-b border-border bg-surface-2">
          <Td colSpan={11} className="px-4 py-3.5 whitespace-normal">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[11.5px] tracking-[0.05em] text-text-2 uppercase">
                  What happened
                </div>
                <p className="mt-0.5 text-[13px] text-text-1">
                  {row.description || "No description was recorded."}
                </p>
                <p className="mt-1 text-[12px] text-text-2">
                  Raised {formatDate(row.createdAt)}
                  {row.resolvedAt
                    ? ` · closed ${formatDate(row.resolvedAt)}${row.resolvedBy ? ` by ${row.resolvedBy}` : ""}`
                    : ""}
                  {row.orderValue > 0
                    ? ` · order value ₹${formatNumber(row.orderValue)}`
                    : ""}
                </p>
              </div>

              {closed ? (
                <div className="text-[12.5px] text-text-2">
                  Resolved as{" "}
                  <strong className="text-text-1">
                    {row.resolution ? RESOLUTION_LABEL[row.resolution] : "—"}
                  </strong>
                  {row.resolutionNote ? ` — ${row.resolutionNote}` : ""}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={selectCls}
                    aria-label="Next status"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                  >
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_TEXT[s]}
                      </option>
                    ))}
                  </select>
                  {nextStatus === "RESOLVED" ? (
                    <select
                      className={selectCls}
                      aria-label="Resolution"
                      value={resolution}
                      onChange={(e) =>
                        setResolution(e.target.value as IssueResolution)
                      }
                    >
                      {ISSUE_RESOLUTIONS.map((r) => (
                        <option key={r} value={r}>
                          {RESOLUTION_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="How was it settled?"
                    className="h-9 min-w-[240px] flex-1"
                  />
                  <Button
                    size="lg"
                    disabled={!canEdit || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    Save
                  </Button>
                  {error ? (
                    <span className="text-[12px] font-medium text-status-red">
                      {error}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </Td>
        </tr>
      ) : null}
    </>
  );
}
