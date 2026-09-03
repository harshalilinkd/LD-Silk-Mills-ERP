import type { NextRequest } from "next/server";

import { jsonError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { raiseConcern } from "@/lib/help-slip/mutations";
import { loadMyConcerns } from "@/lib/help-slip/queries";
import { firstIssue, raiseConcernSchema } from "@/lib/help-slip/validation";
import {
  CONCERN_SORTS,
  DEFAULT_CONCERN_FILTERS,
  parseDateParam,
  parseDirection,
  parsePage,
  parseSort,
  parseStatusParam,
  type ConcernFilters,
} from "@/lib/help-slip/types";

/**
 * GET /api/help-slip/concerns — My Concerns.
 *
 * Everything is filtered, sorted and paged in POSTGRES. Nothing is filtered in
 * the browser: a phone on mobile data must not download a person's whole
 * history in order to hide most of it, and two screens deriving "overdue"
 * independently is how they end up disagreeing — which is why this reads
 * `v_concerns` and never the base table.
 *
 * Every parameter is parsed against a closed vocabulary rather than passed
 * through. An unrecognised sort key falls back to `created_at` instead of
 * reaching the query builder, so a hand-edited URL cannot name a column.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const filters: ConcernFilters = {
    search: p.get("q") ?? "",
    status: parseStatusParam(p.get("status")),
    from: parseDateParam(p.get("from")),
    to: parseDateParam(p.get("to")),
    sort: parseSort(
      p.get("sort"),
      CONCERN_SORTS,
      DEFAULT_CONCERN_FILTERS.sort,
    ),
    direction: parseDirection(p.get("dir")),
  };

  return withHelpSlipRoute(
    "GET /api/help-slip/concerns",
    (db, session) =>
      loadMyConcerns(db, session, filters, parsePage(p.get("page"))),
    "Could not load your concerns. Check your connection and try again.",
  );
}

/**
 * POST /api/help-slip/concerns — file one.
 *
 * The concern and its up-to-three proposed solutions are written inside the
 * ONE transaction `withCurrentUser` opens, so there is no state in which a
 * concern exists without the fixes its author suggested — the single artefact
 * this product exists to prevent.
 *
 * IDEMPOTENT on `clientRequestId`, which the form mints once per mount and
 * sends with every attempt. A phone on mobile data times out on requests the
 * server actually processed; a retry returns the concern that already exists
 * with `created: false`, rather than a second one for the coordinator to
 * disambiguate.
 *
 * NOT SENT, and refused if it were: `concernNumber` (a BEFORE INSERT trigger
 * assigns it from a sequence — D5), the employee id, the org, the status and
 * the timestamps. The schema below has no field for any of them, so the only
 * way to file a concern as somebody else is to be somebody else.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = raiseConcernSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "POST /api/help-slip/concerns",
    (db, session) => raiseConcern(db, session, parsed.data),
    "Couldn't send that. Check your connection and try again.",
  );
}
