import { Suspense } from "react";
import { IconLock } from "@tabler/icons-react";

import { AllConcerns } from "@/components/help-slip/all-concerns";
import { ListFallback } from "@/components/help-slip/fallback";
import { isStaff, resolveHelpSlipSession } from "@/lib/help-slip/authz";

/**
 * All Concerns — the coordinator's archive.
 *
 * Staff-only, and the check is here as well as on the route because the two do
 * different jobs. The route's 403 is what stops an employee's browser reading
 * other people's concerns; this is what stops them landing on a screen with a
 * "Raised by" column and an assignee filter and no way to understand why it is
 * empty. Neither is the security boundary — RLS is, and it would have narrowed
 * the query to their own rows regardless.
 */
export default async function HelpSlipAllConcernsPage() {
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
          It lists every concern on record. Yours are all under{" "}
          <a
            href="/help-slip/concerns"
            className="text-accent-text underline underline-offset-2"
          >
            My Concerns
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<ListFallback />}>
      <AllConcerns />
    </Suspense>
  );
}
