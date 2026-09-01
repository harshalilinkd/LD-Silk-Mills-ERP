import { notFound } from "next/navigation";
import { getOrderDetail } from "@/lib/order-entry/get-order-detail";
import { OrderForm } from "@/components/order-entry/orders/order-form";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Edit order {detail.order.order_no}
        </h1>
      </div>
      <OrderForm
        mode="edit"
        orderId={id}
        initial={{
          order_no: detail.order.order_no,
          order_date: detail.order.order_date,
          party_name: detail.order.party_name,
          sales_person: detail.order.sales_person ?? "",
          agent: detail.order.agent ?? "",
          haste: detail.order.haste ?? "",
          transport: detail.order.transport ?? "",
          challan_no: detail.order.challan_no ?? "",
          lot_no: detail.order.lot_no ?? "",
          department: detail.order.department ?? "LD",
          remarks: detail.order.remarks ?? "",
          fabrics: detail.fabrics,
        }}
      />
    </div>
  );
}
