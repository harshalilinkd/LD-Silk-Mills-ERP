import type { NextRequest } from "next/server";

import {
  HelpSlipForbiddenError,
  jsonError,
  withHelpSlipRoute,
} from "@/lib/help-slip/api";
import { loadDepartments } from "@/lib/help-slip/queries";
import {
  approveAccessRequest,
  loadAccessRequests,
  rejectAccessRequest,
} from "@/lib/help-slip/settings";
import { accessDecisionSchema, firstIssue } from "@/lib/help-slip/validation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST — approve or reject one request.
 *
 * Both go through the database's own `security definer` functions rather than
 * being reassembled here. `approve_access_request` creates the profile, stamps
 * the request reviewed and records who reviewed it in ONE transaction; doing
 * that in three statements from here would open a window in which a profile
 * exists for a request that still reads "pending", and somebody would be let
 * in with no record of who let them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("That request no longer exists.", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Couldn't read that request.", 400);
  }

  const parsed = accessDecisionSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "POST /api/help-slip/settings/access-requests/[id]",
    async (db, session) => {
      if (session.role !== "admin") {
        throw new HelpSlipForbiddenError(
          "Only an admin can approve or reject access.",
        );
      }

      if (parsed.data.decision === "approve") {
        await approveAccessRequest(db, {
          requestId: id,
          role: parsed.data.role,
          departmentId: parsed.data.departmentId,
          hrAccess: parsed.data.hrAccess,
          fullName: parsed.data.fullName,
        });
      } else {
        await rejectAccessRequest(db, {
          requestId: id,
          reason: parsed.data.reason,
        });
      }

      return {
        requests: await loadAccessRequests(db),
        departments: await loadDepartments(db),
      };
    },
    "Couldn't record that decision. Check your connection and try again.",
  );
}
