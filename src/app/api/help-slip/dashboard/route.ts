import { withHelpSlipRoute } from "@/lib/help-slip/api";
import { loadEmployeeDashboard } from "@/lib/help-slip/queries";

/**
 * GET /api/help-slip/dashboard — the employee dashboard, in ONE request.
 *
 * KPIs, the sparkline series, the newest four concerns, the newest five
 * notifications and the unread count all come out of a single
 * `withCurrentUser`, which is a single transaction on a single pooled
 * connection. Five routes would have been five pinned connections out of a
 * pool of five (see the concurrency warning in src/db/help-slip/rls.ts).
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/dashboard",
    (db, session) => loadEmployeeDashboard(db, session),
    "Could not load your dashboard. Check your connection and try again.",
  );
}
