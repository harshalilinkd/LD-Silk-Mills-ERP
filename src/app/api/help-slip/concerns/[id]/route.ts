import type { NextRequest } from "next/server";

import { jsonData, jsonError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { applyConcernAction } from "@/lib/help-slip/mutations";
import { loadConcernDetailPayload } from "@/lib/help-slip/queries";
import {
  concernActionSchema,
  firstIssue,
} from "@/lib/help-slip/validation";

/**
 * ONE concern — read it, and act on it.
 *
 * Both verbs open exactly ONE `withCurrentUser`, which is one transaction on
 * one pooled connection out of five (see the concurrency warning in
 * src/db/help-slip/rls.ts). That is why the whole page — the concern, its
 * solutions, its timeline and the assignee list — comes back in a single
 * request rather than the four the source uses, and why every write answers
 * with the freshly re-read page instead of leaving the screen to fetch it.
 */

/**
 * GET — the concern page, or null.
 *
 * ⚠️ NULL IS AN ANSWER, and the 200 beside it is deliberate. RLS returns zero
 * rows for a concern you may not read; it does not raise. So a guessed uuid, a
 * typo'd one and a real one belonging to somebody else all produce the
 * identical response, and the screen renders the identical "Not found". That
 * indistinguishability IS the security property — a 403 here would confirm the
 * id exists, which is precisely what an employee must not be able to learn
 * about a colleague's confidential complaint.
 *
 * Internal notes are filtered before this returns for a non-staff reader:
 * `v_concern_updates` refuses them (its WHERE reproduces `updates_select`),
 * `loadConcernUpdates` refuses them again, and `<Timeline>` refuses them a
 * third time on the way to the screen.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    // Somebody edited the URL. Same answer as a well-formed id belonging to
    // someone else — never a different one, or the difference is the leak.
    return jsonData(null);
  }

  return withHelpSlipRoute(
    "GET /api/help-slip/concerns/[id]",
    (db, session) => loadConcernDetailPayload(db, session, id),
    "Couldn't load this concern. Check your connection and try again.",
  );
}

/**
 * POST — every write a concern's page can make, as one action union.
 *
 * The union is in `validation.ts` and the rules are in `state-machine.ts`, so
 * the workspace's disabled buttons and this handler's refusals come from one
 * table and cannot disagree.
 *
 * Role is checked HERE as well as in the database, and the two are doing
 * different jobs. `concerns_update` is `using (is_staff())`, so an employee's
 * status change already matches zero rows — but a zero-row UPDATE reports
 * success, and "saved" is the one thing it must not say. `comment` is the only
 * member an employee may send.
 *
 * The response is the same shape GET returns, re-read after the write inside
 * the same transaction: the screen replaces its cache with the truth rather
 * than guessing at it, in one round trip.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("No such concern.", 404);

  const body = await req.json().catch(() => null);
  const parsed = concernActionSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "POST /api/help-slip/concerns/[id]",
    async (db, session) => {
      await applyConcernAction(db, session, id, parsed.data);
      return loadConcernDetailPayload(db, session, id);
    },
    "That didn't save. Nothing was changed.",
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
