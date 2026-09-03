import type { NextRequest } from "next/server";

import {
  HelpSlipForbiddenError,
  HelpSlipRejectedError,
  jsonError,
  withHelpSlipRoute,
} from "@/lib/help-slip/api";
import { updateUser } from "@/lib/help-slip/settings";
import { firstIssue, userPatchSchema } from "@/lib/help-slip/validation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Column name → the sentence a person should read about it. */
const FIELD_COPY: Record<string, string> = {
  role: "their role",
  hrAccess: "confidential-complaint access",
  departmentId: "their department",
  status: "their account status",
};

/**
 * PATCH /api/help-slip/settings/users/[id] — edit somebody else.
 *
 * ── WHY THIS ROUTE LOOKS PARANOID ─────────────────────────────────────────
 *
 * `ld_help_slip.guard_profile_columns` does not refuse a change it disallows —
 * it silently REWRITES the column back to its old value and lets the UPDATE
 * succeed. A coordinator editing somebody's role gets one row back, no error,
 * and no change. Reporting that as "Saved" would tell an admin that somebody
 * has confidential access when they do not, which is the one lie a permissions
 * screen must never tell.
 *
 * So `updateUser` re-reads the row and compares it against what was asked for.
 * A non-empty `refused` list becomes a 403 NAMING the fields that did not move,
 * and the screen shows the stored row so the form snaps back to the truth
 * rather than sitting on a value the database rejected.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("That person no longer exists.", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Couldn't read that request.", 400);
  }

  const parsed = userPatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "PATCH /api/help-slip/settings/users/[id]",
    async (db, session) => {
      if (session.role !== "admin" && session.role !== "pc") {
        throw new HelpSlipForbiddenError(
          "Only coordinators and admins can edit people.",
        );
      }

      // Said early so the common case is a sentence rather than a silent
      // no-op the comparison below would have to explain after the fact. The
      // trigger still has the final word.
      if (
        session.role !== "admin" &&
        (parsed.data.role !== undefined || parsed.data.hrAccess !== undefined)
      ) {
        throw new HelpSlipForbiddenError(
          "Only an admin can change a role or confidential-complaint access.",
        );
      }

      const result = await updateUser(db, id, parsed.data);

      if (!result.ok) {
        // The database threw PART of the write away and kept the rest — the
        // trigger rewrites the guarded columns and lets the row through. Say
        // exactly that: claiming nothing saved would be as wrong as claiming
        // everything did, and this screen decides who reads HR complaints.
        const what = result.refused
          .map((f) => FIELD_COPY[f] ?? f)
          .join(" and ");
        throw new HelpSlipRejectedError(
          `Your other changes were saved, but the database refused to change ${what}. Only an admin can do that.`,
        );
      }

      return { user: result.user };
    },
    "Couldn't save that person. Check your connection and try again.",
  );
}
