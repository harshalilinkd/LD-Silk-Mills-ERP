import Link from "next/link";
import { notFound } from "next/navigation";
import { IconEdit, IconArrowLeft, IconRoute } from "@tabler/icons-react";
import { getOrderDetail } from "@/lib/order-entry/get-order-detail";
import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { hasCap } from "@/lib/order-entry/rbac";
import { CancelOrderButton } from "@/components/order-entry/orders/cancel-order-button";

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-status-green-dim text-status-green",
  "PARTIALLY COMPLETED": "bg-status-amber-dim text-status-amber",
  PENDING: "bg-white/5 text-text-3",
  CANCELLED: "bg-status-red-dim text-status-red",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const session = await auth();
  const authz = session?.user?.email
    ? await resolveOrderEntryAuthz(session.user.email)
    : null;
  const canEdit =
    authz && (authz.role === "ADMIN" || hasCap(authz.caps, "orders.edit"));
  const canViewOps =
    authz && (authz.role === "ADMIN" || hasCap(authz.caps, "operations.view"));

  const { order } = detail;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/order-entry/orders"
        className="flex w-fit items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text-1"
      >
        <IconArrowLeft className="size-3.5" /> Back to orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-bold tracking-[-0.01em] text-text-1">
              {order.order_no}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[detail.operations_status]}`}
            >
              {detail.operations_status}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-text-3">
            {order.party_name} · {formatDate(order.order_date)}
          </p>
        </div>
        <div className="flex gap-2">
          {canViewOps && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/order-entry/order-status`} />}
            >
              <IconRoute className="size-4" />
              Track
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/order-entry/orders/${order.id}/edit`} />}
              >
                <IconEdit className="size-4" />
                Edit
              </Button>
              <CancelOrderButton
                orderId={order.id}
                cancelled={detail.is_order_cancelled}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 rounded-[10px] border border-border bg-surface px-5 py-[18px] sm:grid-cols-4">
        {[
          ["Sales person", order.sales_person],
          ["Agent", order.agent],
          ["Haste", order.haste],
          ["Transport", order.transport],
          ["Challan no", order.challan_no],
          ["Lot no", order.lot_no],
          ["Department", order.department],
          ["Created by", order.created_by],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-[0.04em] text-text-3">
              {label}
            </div>
            <div className="mt-0.5 text-[13px] text-text-1">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[14.5px] font-bold text-text-1">
            Fabrics &amp; designs
          </h2>
          <div className="text-[12.5px] text-text-3">
            {formatNumber(detail.qty_total)} m · ₹{formatNumber(detail.grand_total)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Fabric", "Design", "Qty (m)", "Rate", "Total", "Status"].map(
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
              {detail.lines.map((l) => (
                <tr key={l.id} className={l.is_cancelled ? "opacity-50" : ""}>
                  <td className="border-b border-border px-3.5 py-3 text-text-1">
                    {l.quality}
                  </td>
                  <td className="border-b border-border px-3.5 py-3 font-mono text-text-1">
                    {l.design_no}
                    {l.is_cancelled && (
                      <span className="ml-1.5 text-[10.5px] text-status-red">
                        (cancelled)
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                    {l.qty_mtr}
                  </td>
                  <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                    {l.rate ?? "—"}
                  </td>
                  <td className="border-b border-border px-3.5 py-3 font-mono text-text-1">
                    {l.line_total ? `₹${formatNumber(Number(l.line_total))}` : "—"}
                  </td>
                  <td className="border-b border-border px-3.5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[l.operations_status]}`}
                    >
                      {l.operations_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {order.remarks && (
        <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
          <h2 className="mb-2 text-[14.5px] font-bold text-text-1">Remarks</h2>
          <p className="whitespace-pre-wrap text-[13px] text-text-2">
            {order.remarks}
          </p>
        </div>
      )}
    </div>
  );
}
