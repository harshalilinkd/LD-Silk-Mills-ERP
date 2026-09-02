import type { NextRequest } from "next/server";

import { HelpSlipForbiddenError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { isStaff } from "@/lib/help-slip/authz";
import { loadAllConcerns } from "@/lib/help-slip/queries";
import {
  ASSIGNEE_UNASSIGNED,
  DEFAULT_PC_FILTERS,
  PC_SORTS,
  parseDateParam,
  parseDirection,
  parsePage,
  parsePriorityParam,
  parseSort,
  parseStatusParam,
  type PcListFilters,
} from "@/lib/help-slip/types";

/**
 * GET /api/help-slip/all-concerns — the coordinator's ARCHIVE.
 *
 * The queue answers "what needs me now"; this answers "where is that thing".
 * Nothing is hidden by default, newest first, and every dimension somebody
 * might remember a concern by is a filter. Two screens because they are two
 * questions — merging them gives one screen that answers neither, which is
 * what "just add a Show resolved toggle to the queue" turns into.
 *
 * It reads `v_concerns`, which is `security_invoker`: a coordinator without
 * `hr_access` cannot see a confidential concern here any more than anywhere
 * else, and is not told one exists.
 *
 * The department and assignee option lists ride along in the same transaction
 * — two more round trips on one connection, rather than two more routes
 * competing for the pool every time this screen mounts.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const rawAssignee = p.get("assignee");
  const filters: PcListFilters = {
    search: p.get("q") ?? "",
    status: parseStatusParam(p.get("status")),
    priority: parsePriorityParam(p.get("priority")),
    departmentId: p.get("department") || null,
    assignee:
      rawAssignee === ASSIGNEE_UNASSIGNED ? ASSIGNEE_UNASSIGNED : rawAssignee || null,
    from: parseDateParam(p.get("from")),
    to: parseDateParam(p.get("to")),
    sort: parseSort(p.get("sort"), PC_SORTS, DEFAULT_PC_FILTERS.sort),
    direction: parseDirection(p.get("dir")),
  };

  return withHelpSlipRoute(
    "GET /api/help-slip/all-concerns",
    async (db, session) => {
      if (!isStaff(session.role)) {
        throw new HelpSlipForbiddenError(
          "The archive is a coordinator screen. Your own concerns are under My Concerns.",
        );
      }
      return loadAllConcerns(db, filters, parsePage(p.get("page")));
    },
    "Could not load concerns. Check your connection and try again.",
  );
}
