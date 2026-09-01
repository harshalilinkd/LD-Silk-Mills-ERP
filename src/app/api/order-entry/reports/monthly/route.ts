import { jsonData, requireRole } from "@/lib/order-entry/api";
import { ROLES } from "@/lib/order-entry/rbac";
import { loadMonthlyReport } from "@/lib/order-entry/monthly-report";

export async function GET(req: Request) {
  const guard = await requireRole(ROLES);
  if (!guard.ok) return guard.response;

  const dept = new URL(req.url).searchParams.get("department");
  return jsonData(
    await loadMonthlyReport(dept === "LD" || dept === "LINKD" ? dept : "ALL"),
  );
}
