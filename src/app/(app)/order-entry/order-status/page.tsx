import Link from "next/link";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconBan,
  IconCircleCheck,
  IconClipboardList,
  IconRoute,
  IconSearch,
} from "@tabler/icons-react";
import { loadOrderStatus } from "@/lib/order-entry/order-status-query";
import { STAGE_OPTIONS } from "@/lib/order-entry/order-status";
import { formatCount, formatDate, formatNumber } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { StatusPanel } from "@/components/order-entry/order-status/status-panel";
import { ExportCsvButton } from "@/components/order-entry/order-status/export-csv-button";
import { OVERALL_LABEL, OVERALL_TONE } from "@/components/order-entry/order-status/status-style";
import { cn } from "@/lib/utils";

// Every filter loadOrderStatus understands, minus `page`/`detail` (handled
// separately: filter links always reset to page 1, pagination links target a
// specific page, and `detail` drives the slide-over independently of the
// list query). One list, reused by every href builder, so a filter added
// here is automatically preserved everywhere else.
const QUERY_KEYS = [
  "search",
  "department",
  "sales_person",
  "party",
  "fabric",
  "overall",
  "stage",
  "cancelled",
  "from",
  "to",
  "order_no",
  "challan_no",
  "lot_no",
  "haste",
  "sort",
] as const;
type QueryKey = (typeof QUERY_KEYS)[number];
type SP = Record<string, string | undefined>;

function buildHref(
  sp: SP,
  overrides: Partial<Record<QueryKey, string | null>> & { page?: string } = {},
): string {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const v = key in overrides ? overrides[key] : sp[key];
    if (v) params.set(key, v);
  }
  if (overrides.page) params.set("page", overrides.page);
  const qs = params.toString();
  return qs ? `/order-entry/order-status?${qs}` : "/order-entry/order-status";
}

function detailHref(sp: SP, lineId: string): string {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    if (sp[key]) params.set(key, sp[key] as string);
  }
  if (sp.page) params.set("page", sp.page);
  params.set("detail", lineId);
  return `/order-entry/order-status?${params.toString()}`;
}

type KpiKey = "total" | "inProgress" | "completed" | "overdue" | "cancelled";

const KPI_DEFS: {
  key: KpiKey;
  label: string;
  icon: typeof IconClipboardList;
  iconClass: string;
}[] = [
  {
    key: "total",
    label: "Total orders",
    icon: IconClipboardList,
    iconClass: "bg-accent text-accent-text",
  },
  {
    key: "inProgress",
    label: "In progress",
    icon: IconActivity,
    iconClass: "bg-status-blue-dim text-status-blue",
  },
  {
    key: "completed",
    label: "Completed",
    icon: IconCircleCheck,
    iconClass: "bg-status-green-dim text-status-green",
  },
  {
    key: "overdue",
    label: "Overdue",
    icon: IconAlertTriangle,
    iconClass: "bg-status-red-dim text-status-red",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    icon: IconBan,
    iconClass: "bg-chip text-text-3",
  },
];

const KPI_OVERALL: Partial<Record<KpiKey, "in_progress" | "completed" | "overdue">> = {
  inProgress: "in_progress",
  completed: "completed",
  overdue: "overdue",
};

function kpiActive(sp: SP, key: KpiKey): boolean {
  if (key === "total") return !sp.overall && sp.cancelled !== "1";
  if (key === "cancelled") return sp.cancelled === "1";
  return sp.overall === KPI_OVERALL[key] && sp.cancelled !== "1";
}

function kpiHref(sp: SP, key: KpiKey): string {
  const active = kpiActive(sp, key);
  if (key === "total") return buildHref(sp, { overall: null, cancelled: null });
  if (key === "cancelled") {
    return buildHref(sp, { cancelled: active ? null : "1", overall: null });
  }
  return buildHref(sp, { overall: active ? null : KPI_OVERALL[key], cancelled: null });
}

function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
  active,
}: {
  icon: typeof IconClipboardList;
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
        active ? "border-accent-text/40 ring-1 ring-accent-text/30" : "border-border",
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

const INPUT_CLS =
  "h-9 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:border-border-strong";
const LABEL_CLS = "mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3";

function FilterInput({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        className={cn(INPUT_CLS, type === "date" && "font-mono")}
      />
    </div>
  );
}

function FilterSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: [string, string][];
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <select name={name} defaultValue={defaultValue ?? ""} className={INPUT_CLS}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

const SORT_OPTIONS: [string, string][] = [
  ["od_date", "OD date"],
  ["order_no", "Order no"],
  ["party", "Party"],
  ["progress", "Progress"],
];

const ADVANCED_KEYS: QueryKey[] = [
  "party",
  "fabric",
  "sales_person",
  "department",
  "stage",
  "order_no",
  "challan_no",
  "lot_no",
  "haste",
  "from",
  "to",
  "sort",
];

export default async function OrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    if (sp[key]) params.set(key, sp[key] as string);
  }
  if (sp.page) params.set("page", sp.page);

  const data = await loadOrderStatus(params);

  const hasAdvancedFilters = ADVANCED_KEYS.some((k) => sp[k]);
  const exportQs = params.toString().replace(/(^|&)page=[^&]*/, "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Order status
          </h1>
          <p className="mt-1 text-[13px] text-text-3">
            {formatCount(data.summary.total)} order
            {data.summary.total === 1 ? "" : "s"} · {data.summary.inProgress} in
            progress · {data.summary.overdue} overdue · {data.summary.completed}{" "}
            completed
          </p>
        </div>
        <ExportCsvButton queryString={exportQs} disabled={data.total === 0} />
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        {KPI_DEFS.map((k) => (
          <KpiCard
            key={k.key}
            icon={k.icon}
            iconClass={k.iconClass}
            value={formatCount(data.summary[k.key])}
            label={k.label}
            active={kpiActive(sp, k.key)}
            href={kpiHref(sp, k.key)}
          />
        ))}
      </div>

      <form method="get" action="/order-entry/order-status" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <IconSearch className="size-4 shrink-0 text-text-3" />
            <input
              type="text"
              name="search"
              defaultValue={sp.search ?? ""}
              placeholder="Order no, party, fabric, design…"
              className="w-full bg-transparent text-[13px] text-text-1 placeholder:text-text-3 focus:outline-none"
            />
          </div>
          {sp.overall && <input type="hidden" name="overall" value={sp.overall} />}
          {sp.cancelled && <input type="hidden" name="cancelled" value={sp.cancelled} />}
          <button
            type="submit"
            className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2 hover:text-text-1"
          >
            Search
          </button>
        </div>

        <details
          className="rounded-[10px] border border-border bg-surface"
          open={hasAdvancedFilters}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-semibold text-text-2">
            <IconAdjustmentsHorizontal className="size-4" /> Filters
          </summary>
          <div className="grid grid-cols-2 gap-2.5 border-t border-border px-3.5 py-3.5 sm:grid-cols-3 lg:grid-cols-5">
            <FilterInput name="party" label="Party" defaultValue={sp.party} />
            <FilterInput name="fabric" label="Fabric" defaultValue={sp.fabric} />
            <FilterInput
              name="sales_person"
              label="Sales person"
              defaultValue={sp.sales_person}
            />
            <FilterSelect
              name="department"
              label="Department"
              defaultValue={sp.department}
              options={[
                ["", "Any"],
                ["LD", "LD"],
                ["LINKD", "LINKD"],
              ]}
            />
            <FilterSelect
              name="stage"
              label="At stage"
              defaultValue={sp.stage}
              options={[["", "Any stage"], ...STAGE_OPTIONS.map((s) => [s.key, s.label] as [string, string])]}
            />
            <FilterInput name="order_no" label="Order no" defaultValue={sp.order_no} />
            <FilterInput name="challan_no" label="Challan no" defaultValue={sp.challan_no} />
            <FilterInput name="lot_no" label="Lot no" defaultValue={sp.lot_no} />
            <FilterInput name="haste" label="Haste" defaultValue={sp.haste} />
            <FilterSelect
              name="sort"
              label="Sort"
              defaultValue={sp.sort}
              options={SORT_OPTIONS}
            />
            <FilterInput name="from" label="From" type="date" defaultValue={sp.from} />
            <FilterInput name="to" label="To" type="date" defaultValue={sp.to} />
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border px-3.5 py-2.5">
            {hasAdvancedFilters && (
              <Link
                href="/order-entry/order-status"
                className="text-[12px] font-medium text-text-3 hover:text-text-1"
              >
                Clear filters
              </Link>
            )}
            <button
              type="submit"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Apply filters
            </button>
          </div>
        </details>
      </form>

      <div className="rounded-[10px] border border-border bg-surface">
        {data.groups.length === 0 ? (
          <EmptyState
            icon={IconRoute}
            title="No orders match this view"
            description="Try clearing filters or the search box."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {[
                      "Order no",
                      "Date",
                      "Party",
                      "Fabric",
                      "Designs",
                      "Qty (m)",
                      "Value",
                      "Sales person",
                      "Challan / Lot",
                      "Progress",
                      "Current stage",
                      "Status",
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
                  {data.groups.map((g) => {
                    const firstLineId = g.lines[0]?.lineId ?? "";
                    const fabricLabel =
                      g.fabrics.length > 2
                        ? `${g.fabrics.slice(0, 2).join(", ")} +${g.fabrics.length - 2}`
                        : g.fabrics.join(", ") || "—";
                    return (
                      <tr
                        key={g.orderId}
                        className={cn(
                          "relative hover:bg-surface-2",
                          g.isCancelled && "opacity-60",
                        )}
                      >
                        <td className="border-b border-border px-3.5 py-3">
                          {firstLineId && (
                            <Link
                              href={detailHref(sp, firstLineId)}
                              className="absolute inset-0"
                              aria-label={`Open status for ${g.orderNo}`}
                            />
                          )}
                          <span className="font-mono font-semibold text-accent-text">
                            {g.orderNo}
                          </span>
                          {g.haste && (
                            <span className="ml-1.5 text-[10.5px] text-status-amber">
                              {g.haste}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {formatDate(g.odDate)}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-1">
                          {g.party}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {fabricLabel}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                          {g.designCount}
                          {g.cancelledCount > 0 && (
                            <span className="ml-1 font-sans text-[10.5px] text-status-red">
                              +{g.cancelledCount} cancelled
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                          {formatNumber(g.qtyTotal)}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 font-mono text-text-1">
                          ₹{formatNumber(g.grandTotal)}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {g.salesPerson ?? "—"}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {g.challanNo || g.lotNo
                            ? `${g.challanNo ?? "—"} / ${g.lotNo ?? "—"}`
                            : "—"}
                        </td>
                        <td className="border-b border-border px-3.5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${(g.doneCount / (g.stages.length || 1)) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="font-mono text-[11.5px] text-text-3">
                              {g.doneCount}/{g.stages.length}
                            </span>
                          </div>
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {g.isCancelled
                            ? "—"
                            : (g.stages.find((s) => s.stageKey === g.currentStageKey)
                                ?.label ?? "—")}
                        </td>
                        <td className="border-b border-border px-3.5 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                              g.isCancelled
                                ? "bg-chip text-text-3"
                                : OVERALL_TONE[g.overall],
                            )}
                          >
                            {g.isCancelled ? "Cancelled" : OVERALL_LABEL[g.overall]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-3.5 py-3">
              <p className="text-[12px] text-text-3">
                Page {data.page} of {data.totalPages} · {formatCount(data.total)} total
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

      <StatusPanel groups={data.groups} />
    </div>
  );
}
