import { withHelpSlipRoute, HelpSlipForbiddenError } from "@/lib/help-slip/api";
import { loadDepartments } from "@/lib/help-slip/queries";
import { assertStaff, loadUsers, settingsTabsFor } from "@/lib/help-slip/settings";

/**
 * GET /api/help-slip/settings/users — the directory, plus what the caller may
 * do to it.
 *
 * The department list rides along because the edit dialog's one dropdown needs
 * it and this is already inside a pinned RLS transaction — a second request
 * would mean a second connection out of a pool of five (src/db/help-slip/rls.ts).
 *
 * `tabs` and `role` come back so the screen can disable the two controls a
 * coordinator cannot use rather than offering them and having the database
 * quietly ignore the change. That is presentation only: `PATCH` re-checks, and
 * `guard_profile_columns` is the actual boundary either way.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/settings/users",
    async (db, session) => {
      // A rendering guard, not a security one — but an employee asking for the
      // admin directory is asking the wrong question, and an honest 403 beats
      // a screen they cannot use.
      if (session.role !== "admin" && session.role !== "pc") {
        throw new HelpSlipForbiddenError(
          "Settings are for coordinators and admins.",
        );
      }
      assertStaff(session.role);

      return {
        users: await loadUsers(db),
        departments: await loadDepartments(db),
        role: session.role,
        tabs: settingsTabsFor(session.role),
      };
    },
    "Couldn't load the people list. Check your connection and try again.",
  );
}
