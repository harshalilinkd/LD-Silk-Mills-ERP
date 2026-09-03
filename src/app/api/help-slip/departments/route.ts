import { withHelpSlipRoute } from "@/lib/help-slip/api";
import { loadDepartments } from "@/lib/help-slip/queries";

/**
 * GET /api/help-slip/departments — the raise form's one dropdown.
 *
 * ACTIVE ones only: a restored draft must not be able to file a concern into a
 * department nobody reads any more, and `raiseConcern` re-checks the same rule
 * on the way in.
 *
 * A route of its own, rather than folding the list into the page's own render,
 * because the failure matters. The source learned this the hard way — a failed
 * department fetch used to render as a normal, enabled, EMPTY dropdown on a
 * required field, with nothing on screen saying why. Fetched like this the
 * form gets a real loading, error and retry state on the one control it cannot
 * be submitted without.
 *
 * `departments_select` is `using (true)` — everybody needs the dropdown in
 * order to file a concern at all — so this is the one Help Slip read that is
 * the same for every reader. It still runs inside the caller's RLS context,
 * because "the same for everybody" is a property of today's policy and not a
 * licence to skip the context.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/departments",
    async (db) => ({ departments: await loadDepartments(db) }),
    "Couldn't load departments. Check your connection and try again.",
  );
}
