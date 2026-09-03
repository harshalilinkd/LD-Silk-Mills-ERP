import { HelpSlipForbiddenError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { loadDepartments } from "@/lib/help-slip/queries";
import { loadAccessRequests } from "@/lib/help-slip/settings";

/**
 * GET — people who have signed in and are waiting to be let in.
 *
 * This is Help Slip's ONLY onboarding path, and that is a database constraint
 * rather than a preference: `profiles.id` is a foreign key to `auth.users.id`,
 * so a person cannot have a Help Slip profile until they have signed in at
 * least once. There is no "add a user" form in this module and one cannot be
 * built without first creating the sign-in account.
 *
 * The department list rides along because approving somebody names their
 * department in the same step — a profile with no role is not a row the
 * database will accept.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/settings/access-requests",
    async (db, session) => {
      if (session.role !== "admin") {
        throw new HelpSlipForbiddenError(
          "Only an admin can review access requests.",
        );
      }
      return {
        requests: await loadAccessRequests(db),
        departments: await loadDepartments(db),
      };
    },
    "Couldn't load access requests. Check your connection and try again.",
  );
}
