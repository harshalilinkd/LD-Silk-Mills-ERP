import { Suspense } from "react";

import { EmployeeDashboard } from "@/components/help-slip/employee-dashboard";
import { PcDashboard } from "@/components/help-slip/pc-dashboard";
import { isStaff, resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { DashboardFallback } from "@/components/help-slip/fallback";

/**
 * ONE route, TWO screens, chosen by role.
 *
 * `/help-slip` is "the dashboard" for everybody, but a coordinator's dashboard
 * and an employee's are not the same screen with different data in it — they
 * answer different questions, and the standalone app has them on two separate
 * routes for exactly that reason:
 *
 *   employee → "did anything happen to MY concerns?"  four KPIs that link to a
 *              filtered list, the newest four, and the alerts panel.
 *   staff    → "what needs ME now?"                   a filter row, five KPIs
 *              that narrow the queue IN PLACE, the insights charts, and the
 *              needs-attention queue.
 *
 * One route rather than two because the sidebar entry has to point somewhere,
 * and "Dashboard" pointing at a URL that 403s for half the company is worse
 * than a fork. The split happens HERE, on the server, so the browser never
 * downloads the screen it is not going to render.
 *
 * `isStaff()` is the same helper the API routes use, so the two cannot drift
 * about who gets which. It is a rendering decision, not a security one: an
 * employee who hand-types the queue's URL gets an honest 403 from the route,
 * and RLS would have limited them to their own rows regardless.
 */
export default async function HelpSlipDashboardPage() {
  // The layout has already resolved this and rendered the "not provisioned"
  // screen if it was null, so by the time this runs the profile exists. The
  // second call costs one indexed lookup on an email and keeps this component
  // honest about what it depends on.
  const session = await resolveHelpSlipSession();
  if (!session) return null;

  const staff = isStaff(session.role);

  // Both screens read their filters out of `useSearchParams`, which Next
  // requires be suspended.
  return (
    <Suspense fallback={<DashboardFallback />}>
      {staff ? <PcDashboard /> : <EmployeeDashboard />}
    </Suspense>
  );
}
