import { OrderForm } from "@/components/order-entry/orders/order-form";

export default function NewOrderPage() {
  return (
    <div className="flex flex-col gap-5">
      {/* Width-matched to the form below (max-w-[1500px], centred), so the
          title stays flush with the cards on a wide screen. */}
      <div className="mx-auto w-full max-w-[1500px]">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          New order
        </h1>
      </div>
      <OrderForm mode="create" />
    </div>
  );
}
