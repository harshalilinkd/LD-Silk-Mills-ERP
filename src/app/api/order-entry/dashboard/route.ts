import { jsonData, requireRole } from "@/lib/order-entry/api";
import { ROLES } from "@/lib/order-entry/rbac";
import { dashboardParams, loadDashboard } from "@/lib/order-entry/dashboard-query";

// GET /api/order-entry/dashboard?from=&to=&department= — ported from Order
// Entry's /api/dashboard.
export async function GET(req: Request) {
  const guard = await requireRole(ROLES);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const params = dashboardParams({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    department: url.searchParams.get("department"),
  });

  return jsonData(await loadDashboard(params));
}
