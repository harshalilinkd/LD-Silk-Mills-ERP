import { Suspense } from "react";
import Link from "next/link";
import { IconLock } from "@tabler/icons-react";

import { ListFallback } from "@/components/help-slip/fallback";
import { PcWorkspace } from "@/components/help-slip/pc-workspace";
import { isStaff, resolveHelpSlipSession } from "@/lib/help-slip/authz";

/**
 * The coordinator's workspace for one concern. A real URL, refresh-safe, and
 * where a staff notification's deep link lands.
 *
 * Staff-only, and the check is here as well as on the route because the two do
 * different jobs — the same split `/help-slip/all` already documents. The
 * route's refusals are what stop an employee's browser changing a status; this
 * is what stops them landing on a screen full of assign, hold and resolve
 * controls that would all fail, with nothing on it saying why. Neither is the
 * security boundary: RLS is, `concerns_update` is `using (is_staff())`, and
 * `applyConcernAction` re-checks the role before it writes.
 *
 * An employee who follows a link here is sent to their OWN view of the same
 * concern rather than being refused — it is the screen they wanted, and it
 * answers an id they may not read with the ordinary "Not found".
 *
 * Suspended because the screen reads the notification deep-link target out of
 * `useSearchParams`, which Next requires be wrapped.
 */
export default async function HelpSlipWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await resolveHelpSlipSession();
  if (!session) return null;

  if (!isStaff(session.role)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          This screen is for coordinators
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          It is where a concern is assigned, put on hold and resolved. If this
          one is yours, open it from{" "}
          <Link
            href={`/help-slip/concerns/${id}`}
            className="text-accent-text underline underline-offset-2"
          >
            My Concerns
          </Link>{" "}
          instead.
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<ListFallback />}>
      <PcWorkspace id={id} />
    </Suspense>
  );
}
