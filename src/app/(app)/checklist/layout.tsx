import { after } from "next/server";
import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";

import { auth } from "@/auth";
import { resolveChecklistViewer } from "@/lib/checklist/authz";
import { ensureCurrentYearScheduled } from "@/lib/checklist/occurrences";
import { ChecklistProvider } from "./viewer-context";

/**
 * The Checklist.
 *
 * ONE GATE, and it is a real one. `resolveChecklistViewer()` reads
 * `ld_erp_core.system_access` — the tick box in Settings → Access — on the
 * SERVER. Every module in this shell needs that check somewhere: hiding a
 * sidebar link is never a permission, and this module has scorecards on it,
 * which are people's performance records.
 *
 * Whether somebody is a checklist ADMINISTRATOR is resolved here too and put
 * on context, but it is not a gate at this level: a member is meant to open
 * the module and see their own work. The four admin screens turn back anybody
 * they are not for, individually, and so does every action behind them.
 */
export default async function ChecklistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const viewer = await resolveChecklistViewer();

  if (!viewer) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          Not provisioned for the Checklist
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          Your ERP account ({session.user.email}) has not been given the
          Checklist. An administrator can tick it in Settings → Access.
        </p>
      </div>
    );
  }

  /**
   * The financial year rolls over here, after the page has been sent.
   *
   * `after()` runs once the response is already on its way, so whoever opens
   * the Checklist first on the 1st of April does not sit waiting while a
   * year's dates are written — they get their page, and the schedule fills in
   * behind them. It is a single cheap query on almost every request; see
   * `ensureCurrentYearScheduled` for the guard that keeps it that way.
   *
   * Wrapped, because a failure here must never take the module down. The
   * "Rebuild schedule" button on the Tasks screen remains as the manual way
   * in if this ever does not fire.
   */
  after(async () => {
    try {
      const done = await ensureCurrentYearScheduled();
      if (done) {
        console.log(
          `checklist: rolled into ${done.window} — ${done.added} dates across ${done.tasks} tasks`,
        );
      }
    } catch (e) {
      console.error("checklist: year rollover failed", e);
    }
  });

  return <ChecklistProvider value={viewer}>{children}</ChecklistProvider>;
}
