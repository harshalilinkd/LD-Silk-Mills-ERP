import type { NextRequest } from "next/server";

import { HelpSlipForbiddenError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { isStaff } from "@/lib/help-slip/authz";
import { dayKey, dayKeyMinus } from "@/lib/help-slip/format";
import { loadQueue } from "@/lib/help-slip/queries";
import {
  parseDateParam,
  parsePage,
  parsePriorityParam,
  parseQueueBucket,
  type QueueFilters,
} from "@/lib/help-slip/types";

/**
 * GET /api/help-slip/queue — the coordinator dashboard, in ONE request.
 *
 * Rows, the five KPI counts, the insights aggregate and the department list
 * all share one transaction. The alternative — a route each — is four pinned
 * connections out of a pool of five for one screen paint.
 *
 * TWO windows, deliberately not one. `bucket` / `department` / `priority`
 * narrow the "needs attention" TABLE; `from` / `to` narrow the CHARTS. They
 * answer different questions — "what needs me now" versus "what has been
 * happening" — so they are separate parameters rather than one more field on
 * the filters, and the KPI counts (current STATE) ignore the date range
 * entirely.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const filters: QueueFilters = {
    bucket: parseQueueBucket(p.get("bucket")),
    departmentId: p.get("department") || null,
    priority: parsePriorityParam(p.get("priority")),
    needsReassignment: p.get("needsReassignment") === "1",
  };

  // Defaults match what the screen shows on a first visit with a bare URL:
  // the last 30 days ending today.
  const range = {
    from: parseDateParam(p.get("from")) ?? dayKeyMinus(29),
    to: parseDateParam(p.get("to")) ?? dayKey(new Date()),
  };

  return withHelpSlipRoute(
    "GET /api/help-slip/queue",
    async (db, session) => {
      if (!isStaff(session.role)) {
        throw new HelpSlipForbiddenError(
          "The queue is a coordinator screen. Your own concerns are under My Concerns.",
        );
      }
      return loadQueue(db, filters, parsePage(p.get("page")), range);
    },
    "Could not load the queue. Check your connection and try again.",
  );
}
