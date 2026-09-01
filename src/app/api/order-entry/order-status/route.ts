import { jsonData, requireCapability } from "@/lib/order-entry/api";
import { loadOrderStatus } from "@/lib/order-entry/order-status-query";

export async function GET(req: Request) {
  const guard = await requireCapability("orders.view");
  if (!guard.ok) return guard.response;

  return jsonData(await loadOrderStatus(new URL(req.url).searchParams));
}
