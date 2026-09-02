import Link from "next/link";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  IconAdjustmentsHorizontal,
  IconBan,
  IconCircleCheck,
  IconClipboardList,
  IconClock,
  IconListCheck,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { auth } from "@/auth";
import { orderEntryDb as db } from "@/db/order-entry";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
} from "@/db/order-entry/schema";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { hasCap } from "@/lib/order-entry/rbac";
import {
  PROGRESS_STAGE_KEYS_LIST,
  computeOrderStatus,
  isOrderCancelled,
  lineStatusFromCounts,
} from "@/lib/order-entry/workflow";
import {
  formatCount,
  type OperationsStatus,
} from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { ExportOrdersCsvButton } from "@/components/order-entry/orders/export-orders-csv-button";
import { OrdersScreen } from "@/components/order-entry/orders/orders-screen";
import {
  OrdersTable,
  type OrdersTableRow,
} from "@/components/order-entry/orders/orders-table";
import {
  isOrderStatusParam,
  matchesOrderStatusParam,
  type OrderStatusParam,
} from "@/components/order-entry/orders/order-status-filter";
import { cn } from "@/lib/utils";

// Same page size as GET /api/order-entry/orders, so this list and the API
// paginate identically.
const PAGE_SIZE = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Every filter this page understands, minus `page` (pagination links target a
// specific page; every other link resets to page 1). One list, reused by each
// href builder, so a filter added here is preserved everywhere else.
const QUERY_KEYS = [
  "search",
  "order_no",
  "challan_no",
  "lot_no",
  "haste",
  "from",
  "to",
  "status",
] as const;
type QueryKey = (typeof QUERY_KEYS)[number];

// The subset GET /api/order-entry/orders accepts — `status` is derived, not a
// query param, so the CSV export filters it in the browser instead.
const API_KEYS: QueryKey[] = [
  "search",
  "order_no",
  "challan_no",
  "lot_no",
  "haste",
  "from",
  "to",
];

const ADVANCED_KEYS: QueryKey[] = [
  "order_no",
  "challan_no",
  "lot_no",
  "haste",
  "from",
  "to",
];

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
  return qs ? `/order-entry/orders?${qs}` : "/order-entry/orders";
}

type KpiKey = "total" | "completed" | "inProgress" | "pending" | "cancelled";

const KPI_DEFS: {
  key: KpiKey;
  label: string;
  icon: typeof IconClipboardList;
  iconClass: string;
  status: OrderStatusParam | null;
}[] = [
  {
    key: "total",
    label: "Total orders",
    icon: IconClipboardList,
    iconClass: "bg-accent text-accent-text",
    status: null,
  },
  {
    key: "completed",
    label: "Completed",
    icon: IconCircleCheck,
    iconClass: "bg-status-green-dim text-status-green",
    status: "completed",
  },
  {
    key: "inProgress",
    label: "In progress",
    icon: IconListCheck,
    iconClass: "bg-status-amber-dim text-status-amber",
    status: "in_progress",
  },
  {
    key: "pending",
    label: "Pending",
    icon: IconClock,
    iconClass: "bg-chip text-text-3",
    status: "pending",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    icon: IconBan,
    iconClass: "bg-status-red-dim text-status-red",
    status: "cancelled",
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

export default async function OrdersListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const session = await auth();
  const authz = session?.user?.email
    ? await resolveOrderEntryAuthz(session.user.email)
    : null;
  const canEdit =
    !!authz && (authz.role === "ADMIN" || hasCap(authz.caps, "orders.edit"));

  const search = sp.search?.trim() ?? "";
  const orderNo = sp.order_no?.trim() ?? "";
  const challanNo = sp.challan_no?.trim() ?? "";
  const lotNo = sp.lot_no?.trim() ?? "";
  const haste = sp.haste?.trim() ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const status = isOrderStatusParam(sp.status) ? sp.status : undefined;

  // Filter predicates copied from GET /api/order-entry/orders so the two can't
  // drift — same params, same LIKE/date semantics, same "at least one live
  // line" guard that hides fully-deleted (trashed) orders.
  const searchFilter = search
    ? or(
        ilike(customerOrders.orderNo, `%${search}%`),
        ilike(customerOrders.partyName, `%${search}%`),
        ilike(customerOrders.challanNo, `%${search}%`),
        ilike(customerOrders.lotNo, `%${search}%`),
      )
    : undefined;
  const filter = and(
    searchFilter,
    orderNo ? ilike(customerOrders.orderNo, `%${orderNo}%`) : undefined,
    challanNo ? ilike(customerOrders.challanNo, `%${challanNo}%`) : undefined,
    lotNo ? ilike(customerOrders.lotNo, `%${lotNo}%`) : undefined,
    haste ? ilike(customerOrders.haste, `%${haste}%`) : undefined,
    ISO_DATE.test(from) ? gte(customerOrders.orderDate, from) : undefined,
    ISO_DATE.test(to) ? lte(customerOrders.orderDate, to) : undefined,
  );
  const hasVisibleLine = exists(
    db
      .select({ one: sql`1` })
      .from(orderLineItems)
      .where(
        and(
          eq(orderLineItems.orderId, customerOrders.id),
          eq(orderLineItems.isDeleted, false),
        ),
      ),
  );
  const visibleFilter = and(filter, hasVisibleLine);

  // The whole matching set is read, not just one page: the KPI cards have to
  // count every matching order (that's what makes them meaningful as filters),
  // and `status` is derived from stage progress rather than stored, so it can
  // only be applied after the rollup is computed. Same trade-off Order Entry's
  // dashboard made when it fetched with `all=1`. Two queries: the orders, then
  // one grouped pass over their live designs + stage progress.
  const [orders, designRows] = await Promise.all([
    db
      .select({
        id: customerOrders.id,
        orderNo: customerOrders.orderNo,
        orderDate: customerOrders.orderDate,
        partyName: customerOrders.partyName,
        agent: customerOrders.agent,
        haste: customerOrders.haste,
        challanNo: customerOrders.challanNo,
        lotNo: customerOrders.lotNo,
      })
      .from(customerOrders)
      .where(visibleFilter)
      .orderBy(desc(customerOrders.orderDate), desc(customerOrders.createdAt)),
    db
      .select({
        id: orderLineItems.id,
        orderId: orderLineItems.orderId,
        quality: orderLineItems.quality,
        designNo: orderLineItems.designNo,
        qtyMtr: orderLineItems.qtyMtr,
        lineTotal: orderLineItems.lineTotal,
        isCancelled: orderLineItems.isCancelled,
        stageRows: count(lineStageProgress.id),
        doneRows: sql<number>`count(*) filter (where ${lineStageProgress.isDone})`,
        anyProgressStageDone: sql<boolean>`bool_or(${lineStageProgress.isDone} and ${inArray(lineStageProgress.stageKey, [...PROGRESS_STAGE_KEYS_LIST])})`,
      })
      .from(orderLineItems)
      .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
      .leftJoin(
        lineStageProgress,
        eq(lineStageProgress.orderLineItemId, orderLineItems.id),
      )
      .where(and(filter, eq(orderLineItems.isDeleted, false)))
      .groupBy(orderLineItems.id),
  ]);

  const designsByOrder = new Map<string, typeof designRows>();
  for (const d of designRows) {
    const arr = designsByOrder.get(d.orderId) ?? [];
    arr.push(d);
    designsByOrder.set(d.orderId, arr);
  }

  // Cancellation rollup, identical to the API's `summary` block.
  let cancelledDesigns = 0;
  let ordersWithAnyCancelled = 0;
  for (const list of designsByOrder.values()) {
    const c = list.filter((d) => d.isCancelled).length;
    cancelledDesigns += c;
    if (c > 0) ordersWithAnyCancelled += 1;
  }

  const allRows: OrdersTableRow[] = orders.map((o) => {
    const all = designsByOrder.get(o.id) ?? [];
    const active = all.filter((d) => !d.isCancelled);
    const cancelledCount = all.length - active.length;
    const orderCancelled = isOrderCancelled(all.length, cancelledCount);
    // A fully cancelled order still has to show something, so it falls back to
    // all of its (cancelled) designs — same rule as the API.
    const shown = orderCancelled ? all : active;
    const lineStatuses = active.map((d) =>
      lineStatusFromCounts({
        stageRows: Number(d.stageRows),
        doneRows: Number(d.doneRows),
        anyProgressStageDone: Boolean(d.anyProgressStageDone),
      }),
    );
    const rollup: OperationsStatus = orderCancelled
      ? "CANCELLED"
      : computeOrderStatus(lineStatuses);
    return {
      id: o.id,
      orderNo: o.orderNo,
      orderDate: o.orderDate,
      partyName: o.partyName,
      haste: o.haste,
      agent: o.agent,
      challanNo: o.challanNo,
      lotNo: o.lotNo,
      fabrics: [...new Set(shown.map((d) => d.quality))],
      designCount: shown.length,
      cancelledCount,
      qtyTotal: shown.reduce((s, d) => s + Number(d.qtyMtr), 0),
      grandTotal: shown.reduce((s, d) => s + Number(d.lineTotal ?? 0), 0),
      status: rollup,
      designs: all.map((d) => ({
        id: d.id,
        quality: d.quality,
        designNo: d.designNo,
        qtyMtr: Number(d.qtyMtr),
        lineTotal: Number(d.lineTotal ?? 0),
        isCancelled: d.isCancelled,
      })),
    };
  });

  const kpi = {
    total: allRows.length,
    completed: allRows.filter((r) => r.status === "COMPLETED").length,
    inProgress: allRows.filter((r) => r.status === "PARTIALLY COMPLETED").length,
    pending: allRows.filter((r) => r.status === "PENDING").length,
    // The old dashboard's Cancelled card counts cancelled DESIGNS (an order can
    // lose one design without being cancelled itself) while its filter selects
    // the orders those designs belong to — the sub-label says so.
    cancelled: cancelledDesigns,
  } satisfies Record<KpiKey, number>;

  const filteredRows = status
    ? allRows.filter((r) => matchesOrderStatusParam(r, status))
    : allRows;

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(
    Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1),
    totalPages,
  );
  const rows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasAdvancedFilters = ADVANCED_KEYS.some((k) => sp[k]);
  const hasAnyFilter = QUERY_KEYS.some((k) => sp[k]);
  const exportParams = new URLSearchParams();
  for (const key of API_KEYS) {
    if (sp[key]) exportParams.set(key, sp[key] as string);
  }

  // §3.1 — the page no longer renders one view; it renders BOTH halves of the
  // switch and lets the client screen pick. Tracking is the default, so the
  // table below is built on every visit whether or not it is shown: the query
  // is the same two statements it always was, and moving it behind the switch
  // would mean a client round trip (and a flash of empty table) for the users
  // who prefer it.
  const title = (
    <div>
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Orders
      </h1>
      <p className="mt-1 text-[13px] text-text-3">
        {formatCount(kpi.total)} order{kpi.total === 1 ? "" : "s"} ·{" "}
        {kpi.completed} completed · {kpi.inProgress} in progress · {kpi.pending}{" "}
        pending
      </p>
    </div>
  );

  const actions = (
    <>
      <ExportOrdersCsvButton
        queryString={exportParams.toString()}
        status={status}
        disabled={total === 0}
      />
      {canEdit && (
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href="/order-entry/orders/new" />}
        >
          <IconPlus className="size-3.5" />
          New order
        </Button>
      )}
    </>
  );

  const table = (
    <>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        {KPI_DEFS.map((k) => {
          const active = k.status === null ? !status : status === k.status;
          return (
            <KpiCard
              key={k.key}
              icon={k.icon}
              iconClass={k.iconClass}
              value={formatCount(kpi[k.key])}
              label={
                k.key === "cancelled"
                  ? `Cancelled designs · in ${ordersWithAnyCancelled} order${
                      ordersWithAnyCancelled === 1 ? "" : "s"
                    }`
                  : k.label
              }
              active={active}
              href={buildHref(sp, {
                status: k.status === null || active ? null : k.status,
              })}
            />
          );
        })}
      </div>

      <form method="get" action="/order-entry/orders" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <IconSearch className="size-4 shrink-0 text-text-3" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Order no, party, challan, lot…"
              className="w-full bg-transparent text-[13px] text-text-1 placeholder:text-text-3 focus:outline-none"
            />
          </div>
          {status && <input type="hidden" name="status" value={status} />}
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
          <div className="grid grid-cols-2 gap-2.5 border-t border-border px-3.5 py-3.5 sm:grid-cols-3 lg:grid-cols-6">
            <FilterInput name="order_no" label="Order no" defaultValue={sp.order_no} />
            <FilterInput
              name="challan_no"
              label="Challan no"
              defaultValue={sp.challan_no}
            />
            <FilterInput name="lot_no" label="Lot no" defaultValue={sp.lot_no} />
            <FilterInput name="haste" label="Haste" defaultValue={sp.haste} />
            <FilterInput name="from" label="From" type="date" defaultValue={sp.from} />
            <FilterInput name="to" label="To" type="date" defaultValue={sp.to} />
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border px-3.5 py-2.5">
            {hasAnyFilter && (
              <Link
                href="/order-entry/orders"
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
        {rows.length === 0 ? (
          <EmptyState
            icon={IconClipboardList}
            title={
              hasAnyFilter ? "No orders match this view" : "No orders yet"
            }
            description={
              hasAnyFilter
                ? "Try clearing the filters, the search box, or the KPI card you tapped."
                : "New orders show up here as soon as they're entered."
            }
          />
        ) : (
          <>
            <OrdersTable rows={rows} />

            <div className="flex items-center justify-between border-t border-border px-3.5 py-3">
              <p className="text-[12px] text-text-3">
                Page {page} of {totalPages} · {formatCount(total)} total
                {status ? " (filtered)" : ""}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={buildHref(sp, { page: String(page - 1) })}
                    className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                  >
                    Prev
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-3 opacity-40">
                    Prev
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={buildHref(sp, { page: String(page + 1) })}
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
    </>
  );

  return (
    <OrdersScreen
      canEdit={canEdit}
      title={title}
      actions={actions}
      table={table}
    />
  );
}
