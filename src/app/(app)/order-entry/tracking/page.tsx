import Link from "next/link";
import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { IconRoute, IconSearch } from "@tabler/icons-react";
import { orderEntryDb as db } from "@/db/order-entry";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
} from "@/db/order-entry/schema";
import {
  PROGRESS_STAGE_KEYS_LIST,
  computeOrderStatus,
  isOrderCancelled,
  lineStatusFromCounts,
} from "@/lib/order-entry/workflow";
import {
  formatCount,
  formatDate,
  formatNumber,
  type OperationsStatus,
} from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { OPERATIONS_LABEL, OPERATIONS_TONE } from "@/components/order-entry/tracking/status-style";
import { cn } from "@/lib/utils";

// Same page size as GET /api/order-entry/orders, so this list and the orders
// list paginate identically.
const PAGE_SIZE = 20;

type SP = Record<string, string | undefined>;

function buildHref(sp: SP, overrides: { page?: string } = {}): string {
  const params = new URLSearchParams();
  if (sp.search) params.set("search", sp.search);
  const page = "page" in overrides ? overrides.page : sp.page;
  if (page) params.set("page", page);
  const qs = params.toString();
  return qs ? `/order-entry/tracking?${qs}` : "/order-entry/tracking";
}

export default async function OperationsTrackingPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const search = sp.search?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Same filter shape GET /api/order-entry/orders uses for its `search` param
  // (order no / party / challan / lot), plus its "has at least one live line"
  // guard so fully-deleted orders never appear on the board.
  const searchFilter = search
    ? or(
        ilike(customerOrders.orderNo, `%${search}%`),
        ilike(customerOrders.partyName, `%${search}%`),
        ilike(customerOrders.challanNo, `%${search}%`),
        ilike(customerOrders.lotNo, `%${search}%`),
      )
    : undefined;
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
  const filter = and(searchFilter, hasVisibleLine);

  const [totalRes, orders] = await Promise.all([
    db.select({ value: count() }).from(customerOrders).where(filter),
    db
      .select()
      .from(customerOrders)
      .where(filter)
      .orderBy(desc(customerOrders.orderDate), desc(customerOrders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const total = totalRes[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const orderIds = orders.map((o) => o.id);
  const lines = orderIds.length
    ? await db
        .select({
          id: orderLineItems.id,
          orderId: orderLineItems.orderId,
          quality: orderLineItems.quality,
          qtyMtr: orderLineItems.qtyMtr,
          isCancelled: orderLineItems.isCancelled,
        })
        .from(orderLineItems)
        .where(
          and(
            inArray(orderLineItems.orderId, orderIds),
            eq(orderLineItems.isDeleted, false),
          ),
        )
    : [];

  // One grouped read of line_stage_progress → per-line operations status, the
  // same derivation the orders API does (lineStatusFromCounts).
  const lineIds = lines.map((l) => l.id);
  const statusRows = lineIds.length
    ? await db
        .select({
          lineId: lineStageProgress.orderLineItemId,
          stageRows: count(),
          doneRows: sql<number>`count(*) filter (where ${lineStageProgress.isDone})`,
          anyProgressStageDone: sql<boolean>`bool_or(${lineStageProgress.isDone} and ${inArray(lineStageProgress.stageKey, [...PROGRESS_STAGE_KEYS_LIST])})`,
        })
        .from(lineStageProgress)
        .where(inArray(lineStageProgress.orderLineItemId, lineIds))
        .groupBy(lineStageProgress.orderLineItemId)
    : [];
  const statusByLine = new Map<string, OperationsStatus>(
    statusRows.map((s) => [
      s.lineId,
      lineStatusFromCounts({
        stageRows: Number(s.stageRows),
        doneRows: Number(s.doneRows),
        anyProgressStageDone: Boolean(s.anyProgressStageDone),
      }),
    ]),
  );

  const linesByOrder = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = linesByOrder.get(l.orderId) ?? [];
    arr.push(l);
    linesByOrder.set(l.orderId, arr);
  }

  const rows = orders.map((o) => {
    const all = linesByOrder.get(o.id) ?? [];
    const active = all.filter((l) => !l.isCancelled);
    const cancelledCount = all.length - active.length;
    const orderCancelled = isOrderCancelled(all.length, cancelledCount);
    const shown = orderCancelled ? all : active;
    const status: OperationsStatus = orderCancelled
      ? "CANCELLED"
      : computeOrderStatus(active.map((l) => statusByLine.get(l.id) ?? "PENDING"));
    return {
      id: o.id,
      orderNo: o.orderNo,
      orderDate: o.orderDate,
      party: o.partyName,
      haste: o.haste,
      challanNo: o.challanNo,
      lotNo: o.lotNo,
      fabrics: [...new Set(shown.map((l) => l.quality))],
      designCount: shown.length,
      qtyTotal: shown.reduce((s, l) => s + Number(l.qtyMtr), 0),
      status,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Operations
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          {formatCount(total)} order{total === 1 ? "" : "s"} to track · pick one
          to open its 7-stage board
        </p>
      </div>

      <form
        method="get"
        action="/order-entry/tracking"
        className="flex flex-wrap items-center gap-2.5"
      >
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
        <button
          type="submit"
          className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2 hover:text-text-1"
        >
          Search
        </button>
        {search && (
          <Link
            href="/order-entry/tracking"
            className="text-[12px] font-medium text-text-3 hover:text-text-1"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-[10px] border border-border bg-surface">
        {rows.length === 0 ? (
          <EmptyState
            icon={IconRoute}
            title="No orders to track"
            description={
              search
                ? "Nothing matches this search — try clearing it."
                : "Orders show up here as soon as they're entered."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {[
                      "Order no",
                      "Date",
                      "Party",
                      "Fabrics",
                      "Designs",
                      "Qty (m)",
                      "Challan / Lot",
                      "Status",
                      "",
                    ].map((h, i) => (
                      <th
                        key={h || `col-${i}`}
                        className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {rows.map((r) => {
                    const fabricLabel =
                      r.fabrics.length > 2
                        ? `${r.fabrics.slice(0, 2).join(", ")} +${r.fabrics.length - 2}`
                        : r.fabrics.join(", ") || "—";
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "hover:bg-surface-2",
                          r.status === "CANCELLED" && "opacity-60",
                        )}
                      >
                        <td className="border-b border-border px-3.5 py-3">
                          <span className="font-mono font-semibold text-accent-text">
                            {r.orderNo}
                          </span>
                          {r.haste && (
                            <span className="ml-1.5 text-[10.5px] text-status-amber">
                              {r.haste}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {formatDate(r.orderDate)}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-1">
                          {r.party}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {fabricLabel}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                          {r.designCount}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                          {formatNumber(r.qtyTotal)}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {r.challanNo || r.lotNo
                            ? `${r.challanNo ?? "—"} / ${r.lotNo ?? "—"}`
                            : "—"}
                        </td>
                        <td className="border-b border-border px-3.5 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
                              OPERATIONS_TONE[r.status],
                            )}
                          >
                            {OPERATIONS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-right">
                          <Link
                            href={`/order-entry/tracking/${r.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2 hover:text-text-1"
                          >
                            <IconRoute className="size-3.5" />
                            Track
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-3.5 py-3">
              <p className="text-[12px] text-text-3">
                Page {page} of {totalPages} · {formatCount(total)} total
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
    </div>
  );
}
