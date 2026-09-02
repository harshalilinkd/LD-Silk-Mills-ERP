import Link from "next/link";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconPhoneCall,
  IconPhoneOff,
  IconPhoneOutgoing,
  IconSearch,
} from "@tabler/icons-react";
import { loadFollowups } from "@/lib/order-entry/crm-query";
import {
  FOLLOWUP_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type FollowupStatus,
} from "@/lib/order-entry/crm";
import { PriorityBar, StatusPill } from "@/components/order-entry/crm/pill";
import { EmptyState } from "@/components/shell/empty-state";
import { formatCount, formatDate, formatNumber } from "@/lib/order-entry/orders";
import { cn } from "@/lib/utils";

// Every filter this page understands, minus `page` (handled separately so
// filter links always reset to page 1 while pagination links can target a
// specific page). One list, reused by every link builder below, so a filter
// added here is automatically preserved everywhere else.
const PRESERVE_KEYS = [
  "status",
  "sort",
  "q",
  "transport",
  "assigned",
  "from",
  "to",
  "kpi",
] as const;
type PreserveKey = (typeof PRESERVE_KEYS)[number];

function buildHref(
  sp: Record<string, string | undefined>,
  overrides: Partial<Record<PreserveKey, string | null>> & { page?: string } = {},
): string {
  const params = new URLSearchParams();
  for (const key of PRESERVE_KEYS) {
    const v = key in overrides ? overrides[key] : sp[key];
    if (v) params.set(key, v);
  }
  if (overrides.page) params.set("page", overrides.page);
  const qs = params.toString();
  return qs ? `/crm?${qs}` : "/crm";
}

type KpiKey = "dueToday" | "overdue" | "inProgress" | "completed30d" | "unreachable";

const KPI_DEFS: {
  key: KpiKey;
  label: string;
  icon: typeof IconClock;
  iconClass: string;
}[] = [
  {
    key: "dueToday",
    label: "Due today",
    icon: IconClock,
    iconClass: "bg-status-blue-dim text-status-blue",
  },
  {
    key: "overdue",
    label: "Call overdue",
    icon: IconAlertTriangle,
    iconClass: "bg-status-red-dim text-status-red",
  },
  {
    key: "inProgress",
    label: "In progress",
    icon: IconPhoneOutgoing,
    iconClass: "bg-status-amber-dim text-status-amber",
  },
  {
    key: "completed30d",
    label: "Completed (30d)",
    icon: IconCircleCheck,
    iconClass: "bg-status-green-dim text-status-green",
  },
  {
    key: "unreachable",
    label: "Unreachable",
    icon: IconPhoneOff,
    iconClass: "bg-status-purple-dim text-status-purple",
  },
];

function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
  active,
}: {
  icon: typeof IconClock;
  iconClass: string;
  value: string;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-[10px] border bg-surface p-[18px] transition-colors hover:bg-surface-2",
        active
          ? "border-accent-text/40 ring-1 ring-accent-text/30"
          : "border-border",
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
    </Link>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
        active
          ? "bg-accent-dim text-accent-text"
          : "bg-white/5 text-text-3 hover:bg-surface-2 hover:text-text-2",
      )}
    >
      {children}
    </Link>
  );
}

const SORTS: { key: string; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "oldest", label: "Oldest" },
  { key: "value", label: "Highest value" },
];

export default async function CrmFollowupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const params = new URLSearchParams();
  for (const key of [
    "page",
    "sort",
    "status",
    "q",
    "transport",
    "assigned",
    "from",
    "to",
    "kpi",
  ]) {
    if (sp[key]) params.set(key, sp[key] as string);
  }

  const data = await loadFollowups(params);

  const activeStatus = sp.status ?? "ALL";
  const activeSort = sp.sort ?? "priority";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Follow-up queue
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          {formatCount(data.total)} follow-up{data.total === 1 ? "" : "s"} in
          the queue
        </p>
        {data.created > 0 && (
          <p className="mt-1 text-[12px] text-accent-text">
            {data.created} new follow-up{data.created === 1 ? "" : "s"} just
            created
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        {KPI_DEFS.map((k) => (
          <KpiCard
            key={k.key}
            icon={k.icon}
            iconClass={k.iconClass}
            value={formatCount(data.kpis[k.key])}
            label={k.label}
            active={sp.kpi === k.key}
            href={buildHref(sp, { kpi: sp.kpi === k.key ? null : k.key })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip href={buildHref(sp, { status: null })} active={activeStatus === "ALL"}>
            All
          </FilterChip>
          {FOLLOWUP_STATUSES.map((s: FollowupStatus) => (
            <FilterChip
              key={s}
              href={buildHref(sp, { status: s })}
              active={activeStatus === s}
            >
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form
            method="get"
            action="/crm"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <IconSearch className="size-4 shrink-0 text-text-3" />
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Order no or party name…"
              className="w-52 bg-transparent text-[13px] text-text-1 placeholder:text-text-3 focus:outline-none"
            />
            {sp.kpi && <input type="hidden" name="kpi" value={sp.kpi} />}
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
            {sp.transport && (
              <input type="hidden" name="transport" value={sp.transport} />
            )}
            {sp.assigned && (
              <input type="hidden" name="assigned" value={sp.assigned} />
            )}
            {sp.from && <input type="hidden" name="from" value={sp.from} />}
            {sp.to && <input type="hidden" name="to" value={sp.to} />}
          </form>

          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-text-3">Sort</span>
            {SORTS.map((s) => (
              <FilterChip
                key={s.key}
                href={buildHref(sp, { sort: s.key === "priority" ? null : s.key })}
                active={activeSort === s.key}
              >
                {s.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={IconPhoneCall}
            title="No follow-ups match this view"
            description="Try clearing filters or the search box."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {[
                      "Priority",
                      "Order",
                      "Delivered",
                      "Status",
                      "Days",
                      "Value",
                      "Qty",
                      "Issues",
                      "Assigned to",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="relative hover:bg-surface-2">
                      <td className="border-b border-border px-3.5 py-3">
                        <Link
                          href={`/crm/${row.id}`}
                          className="absolute inset-0"
                          aria-label={`Open follow-up for ${row.orderNo}`}
                        />
                        <div className="flex items-center gap-2">
                          <PriorityBar
                            band={row.band}
                            label={PRIORITY_LABEL[row.band]}
                          />
                          <span className="text-[11.5px] text-text-3">
                            {PRIORITY_LABEL[row.band]}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-border px-3.5 py-3">
                        <div className="font-mono font-semibold text-accent-text">
                          {row.orderNo}
                        </div>
                        <div className="text-[11.5px] text-text-3">
                          {row.partyName}
                        </div>
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-text-2">
                        {formatDate(row.deliveredAt)}
                      </td>
                      <td className="border-b border-border px-3.5 py-3">
                        <StatusPill
                          status={row.status}
                          overdue={row.daysOverdue > 0}
                        />
                      </td>
                      <td className="border-b border-border px-3.5 py-3">
                        {row.daysOverdue > 0 ? (
                          <span className="font-mono text-[12.5px] font-semibold text-status-red">
                            {row.daysOverdue}d overdue
                          </span>
                        ) : (
                          <span className="font-mono text-[12.5px] text-text-3">
                            {row.daysWaiting}d waiting
                          </span>
                        )}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 font-mono text-text-1">
                        ₹{formatNumber(row.orderValue)}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                        {formatNumber(row.qtyMtr)} m
                      </td>
                      <td className="border-b border-border px-3.5 py-3">
                        {row.openIssues > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-status-red-dim px-2 py-0.5 text-[10.5px] font-semibold text-status-red">
                            {row.openIssues}
                          </span>
                        ) : (
                          <span className="text-text-3">—</span>
                        )}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-text-2">
                        {row.assignedName ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-3.5 py-3">
              <p className="text-[12px] text-text-3">
                Page {data.page} of {data.totalPages} ·{" "}
                {formatCount(data.total)} total
              </p>
              <div className="flex items-center gap-2">
                {data.page > 1 ? (
                  <Link
                    href={buildHref(sp, { page: String(data.page - 1) })}
                    className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                  >
                    Prev
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-3 opacity-40">
                    Prev
                  </span>
                )}
                {data.page < data.totalPages ? (
                  <Link
                    href={buildHref(sp, { page: String(data.page + 1) })}
                    className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-3 opacity-40">
                    Next
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
