import Link from "next/link";
import { and, desc, eq, exists, sql } from "drizzle-orm";
import { IconClipboardList, IconPlus } from "@tabler/icons-react";
import { orderEntryDb as db } from "@/db/order-entry";
import { customerOrders, orderLineItems } from "@/db/order-entry/schema";
import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { hasCap } from "@/lib/order-entry/rbac";

const PAGE_SIZE = 25;

export default async function OrdersListPage() {
  const session = await auth();
  const authz = session?.user?.email
    ? await resolveOrderEntryAuthz(session.user.email)
    : null;
  const canEdit =
    authz && (authz.role === "ADMIN" || hasCap(authz.caps, "orders.edit"));

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

  const orders = await db
    .select()
    .from(customerOrders)
    .where(hasVisibleLine)
    .orderBy(desc(customerOrders.orderDate), desc(customerOrders.createdAt))
    .limit(PAGE_SIZE);

  const orderIds = orders.map((o) => o.id);
  const lines = orderIds.length
    ? await db
        .select({
          orderId: orderLineItems.orderId,
          quality: orderLineItems.quality,
          qtyMtr: orderLineItems.qtyMtr,
          lineTotal: orderLineItems.lineTotal,
          isCancelled: orderLineItems.isCancelled,
        })
        .from(orderLineItems)
        .where(eq(orderLineItems.isDeleted, false))
    : [];
  const linesByOrder = new Map<string, typeof lines>();
  for (const l of lines) {
    if (!orderIds.includes(l.orderId)) continue;
    const arr = linesByOrder.get(l.orderId) ?? [];
    arr.push(l);
    linesByOrder.set(l.orderId, arr);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Orders
          </h1>
          <p className="mt-1 text-[13px] text-text-3">
            {orders.length} recent order{orders.length === 1 ? "" : "s"}
          </p>
        </div>
        {canEdit && (
          <Button nativeButton={false} render={<Link href="/order-entry/orders/new" />}>
            <IconPlus className="size-4" />
            New order
          </Button>
        )}
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        {orders.length === 0 ? (
          <EmptyState icon={IconClipboardList} title="No orders yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Order no", "Date", "Party", "Fabrics", "Qty (m)", "Value"].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {orders.map((o) => {
                  const all = linesByOrder.get(o.id) ?? [];
                  const active = all.filter((l) => !l.isCancelled);
                  const shown = active.length ? active : all;
                  const qty = shown.reduce((s, l) => s + Number(l.qtyMtr), 0);
                  const total = shown.reduce(
                    (s, l) => s + Number(l.lineTotal ?? 0),
                    0,
                  );
                  const fabrics = [...new Set(shown.map((l) => l.quality))];
                  return (
                    <tr key={o.id}>
                      <td className="border-b border-border px-3.5 py-3">
                        <Link
                          href={`/order-entry/orders/${o.id}`}
                          className="font-mono font-semibold text-accent-text hover:underline"
                        >
                          {o.orderNo}
                        </Link>
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-text-2">
                        {formatDate(o.orderDate)}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-text-1">
                        {o.partyName}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-text-2">
                        {fabrics.join(", ") || "—"}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                        {formatNumber(qty)}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 font-mono text-text-1">
                        ₹{formatNumber(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
