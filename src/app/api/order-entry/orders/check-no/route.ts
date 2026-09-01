import { eq } from "drizzle-orm";
import { jsonData, jsonError, requireRole } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import { ROLES } from "@/lib/order-entry/rbac";
import { customerOrders } from "@/db/order-entry/schema";

export async function GET(req: Request) {
  const guard = await requireRole(ROLES);
  if (!guard.ok) return guard.response;

  const orderNo = new URL(req.url).searchParams.get("orderNo")?.trim();
  if (!orderNo) return jsonError("orderNo is required");

  const [row] = await db
    .select({ id: customerOrders.id })
    .from(customerOrders)
    .where(eq(customerOrders.orderNo, orderNo))
    .limit(1);

  return jsonData({ orderNo, available: !row });
}
