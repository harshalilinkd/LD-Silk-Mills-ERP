import type { NextRequest } from "next/server";

import { withHelpSlipRoute } from "@/lib/help-slip/api";
import { loadMyConcerns } from "@/lib/help-slip/queries";
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
