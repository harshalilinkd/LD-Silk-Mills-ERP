import Link from "next/link";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconClock,
  IconCurrencyRupee,
} from "@tabler/icons-react";
import { loadIssues } from "@/lib/order-entry/crm-query";
import {
  categoryLabel,
  DEFAULT_ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  OWNER_DEPTS,
} from "@/lib/order-entry/crm";
import { formatCount, formatNumber } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IssueTriageRow, DEPT_LABEL } from "@/components/order-entry/crm/issue-triage-row";
import { cn } from "@/lib/utils";

// The complaint log raised during follow-up calls. Complaints are only ever
// CREATED from the follow-up detail page (/crm/[id]) — this board is
// filter + triage + resolve, never "create", so there is no "+ New issue"
// button anywhere on it.

const STATUS_TABS = [
  { value: "OPEN_ANY", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
] as const;

const TABLE_HEAD = [
  "Severity",
  "Order / party",
  "Fabric / design",
  "Category",
  "Department",
  "Age",
  "Order value",
  "Status",
];

const selectCls =
  "h-8 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:border-ring";

function Kpi({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
  active,
}: {
  icon: typeof IconAlertTriangle;
  iconClass: string;
  value: string;
  label: string;
  href?: string;
  active?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-surface p-[18px] transition-colors",
        href && "hover:bg-surface-2",
        active && "border-primary/50",
      )}
    >
      <div
        className={`mb-3.5 flex size-8 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon className="size-[18px]" />
      </div>
      <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-text-1">
        {value}
      </div>
      <div className="mt-[3px] text-xs text-text-3">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function CrmIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "OPEN_ANY";
  const category = sp.category ?? "";
  const severity = sp.severity ?? "";
  const dept = sp.dept ?? "";
  const q = sp.q ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = sp.page ?? "1";

  const params = new URLSearchParams();
  params.set("page", page);
  params.set("status", status);
  if (category) params.set("category", category);
  if (severity) params.set("severity", severity);
  if (dept) params.set("dept", dept);
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const data = await loadIssues(params);

  // One helper for every filter link on the page: start from what's active
  // now, override only what the link is changing, and drop `page` — changing
  // any filter always goes back to page 1.
  const active: Record<string, string> = {};
  if (status) active.status = status;
  if (category) active.category = category;
  if (severity) active.severity = severity;
  if (dept) active.dept = dept;
  if (q) active.q = q;
  if (from) active.from = from;
  if (to) active.to = to;

  function hrefWith(over: Record<string, string | undefined>): string {
    const p = new URLSearchParams();
    const merged = { ...active, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/crm/issues?${p.toString()}`;
  }

  const hasFilters = !!(category || severity || dept || q || from || to);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Issues
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          {formatCount(data.total)} complaint{data.total === 1 ? "" : "s"} ·
          worst first · raised from a follow-up call
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi
          icon={IconAlertTriangle}
          iconClass="bg-status-red-dim text-status-red"
          value={formatCount(data.kpis.open)}
          label="Open issues"
          href={hrefWith({ status: "OPEN_ANY", severity: undefined })}
          active={status === "OPEN_ANY" && !severity}
        />
        <Kpi
          icon={IconCurrencyRupee}
          iconClass="bg-status-amber-dim text-status-amber"
          value={`₹${formatNumber(data.kpis.valueAtRisk)}`}
          label="Value at risk (open)"
        />
        <Kpi
          icon={IconClock}
          iconClass="bg-status-blue-dim text-status-blue"
          value={
            data.kpis.medianResolutionDays != null
              ? `${data.kpis.medianResolutionDays}d`
              : "—"
          }
          label="Median resolution"
          href={hrefWith({ status: "RESOLVED" })}
          active={status === "RESOLVED"}
        />
        <Kpi
          icon={IconAlertCircle}
          iconClass="bg-status-red-dim text-status-red"
          value={formatCount(data.kpis.highSeverity)}
          label="High severity (open)"
          href={hrefWith({ status: "OPEN_ANY", severity: "HIGH" })}
          active={severity === "HIGH"}
        />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-surface p-2">
        {STATUS_TABS.map((t) => {
          const isActive = status === t.value;
          return (
            <Link
              key={t.value}
              href={hrefWith({ status: t.value })}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-text-2 hover:bg-surface-2 hover:text-text-1",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Category / severity / dept / search / date window — one GET form,
          status carried along as a hidden field so submitting it never
          clobbers the tab above. */}
      <form
        method="get"
        action="/crm/issues"
        className="flex flex-wrap items-end gap-2.5 rounded-[10px] border border-border bg-surface p-3.5"
      >
        <input type="hidden" name="status" value={status} />

        <div>
          <label className="mb-1 block text-[11px] tracking-[0.04em] text-text-3 uppercase">
            Category
          </label>
          <select name="category" defaultValue={category} className={selectCls}>
            <option value="">All categories</option>
            {DEFAULT_ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] tracking-[0.04em] text-text-3 uppercase">
            Severity
          </label>
          <select name="severity" defaultValue={severity} className={selectCls}>
            <option value="">All severities</option>
            {ISSUE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] tracking-[0.04em] text-text-3 uppercase">
            Department
          </label>
          <select name="dept" defaultValue={dept} className={selectCls}>
            <option value="">Anyone&rsquo;s to fix</option>
            {OWNER_DEPTS.map((d) => (
              <option key={d} value={d}>
                {DEPT_LABEL[d] ?? d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] tracking-[0.04em] text-text-3 uppercase">
            Raised from
          </label>
          <Input
            type="date"
            name="from"
            defaultValue={from}
            max={to || undefined}
            className="h-8 w-[150px] text-[12.5px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] tracking-[0.04em] text-text-3 uppercase">
            to
          </label>
          <Input
            type="date"
            name="to"
            defaultValue={to}
            min={from || undefined}
            className="h-8 w-[150px] text-[12.5px]"
          />
        </div>

        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] tracking-[0.04em] text-text-3 uppercase">
            Search
          </label>
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Order no, party, quality or design…"
            className="h-8 text-[12.5px]"
          />
        </div>

        <Button type="submit" size="lg">
          Apply
        </Button>
        {hasFilters ? (
          <Button
            nativeButton={false}
            render={
              <Link
                href={hrefWith({
                  status,
                  category: undefined,
                  severity: undefined,
                  dept: undefined,
                  q: undefined,
                  from: undefined,
                  to: undefined,
                })}
              />
            }
            variant="outline"
            size="lg"
          >
            Clear filters
          </Button>
        ) : null}
      </form>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <BreakdownList
          title="By department"
          rows={data.byDept}
          label={(k) => DEPT_LABEL[k] ?? k}
          hrefFor={(k) => hrefWith({ dept: dept === k ? undefined : k })}
          active={dept}
        />
        <BreakdownList
          title="By category"
          rows={data.byCategory}
          label={categoryLabel}
          hrefFor={(k) => hrefWith({ category: category === k ? undefined : k })}
          active={category}
        />
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={IconAlertTriangle}
            title="No complaints match these filters"
            description="Issues are raised from a follow-up call, not from this board — open a follow-up and log one from there."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {TABLE_HEAD.map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "border-b border-border px-3.5 pt-3.5 pb-2.5 text-left text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase",
                        (h === "Age" || h === "Order value") && "text-right",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <IssueTriageRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px] text-text-3">
            <span>
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 ? (
                <Link
                  href={hrefWith({ page: String(data.page - 1) })}
                  className="rounded-lg border border-border px-2.5 py-1 font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                >
                  Previous
                </Link>
              ) : null}
              {data.page < data.totalPages ? (
                <Link
                  href={hrefWith({ page: String(data.page + 1) })}
                  className="rounded-lg border border-border px-2.5 py-1 font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Ranked "who has to act" / "what keeps happening" list. No chart library —
// a number and a rank say everything a bar chart would here, and each row
// doubles as a filter shortcut into the table below.
function BreakdownList({
  title,
  rows,
  label,
  hrefFor,
  active,
}: {
  title: string;
  rows: { key: string; count: number }[];
  label: (key: string) => string;
  hrefFor: (key: string) => string;
  active: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
      <h2 className="mb-3 text-[13.5px] font-bold text-text-1">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-text-3">Nothing to break down yet.</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r) => (
            <Link
              key={r.key}
              href={hrefFor(r.key)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors",
                active === r.key
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-text-2 hover:bg-surface-2 hover:text-text-1",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{label(r.key)}</span>
              <span className="font-mono font-semibold">{r.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
