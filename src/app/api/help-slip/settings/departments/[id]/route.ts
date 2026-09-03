import type { NextRequest } from "next/server";

import {
  HelpSlipForbiddenError,
  jsonError,
  withHelpSlipRoute,
} from "@/lib/help-slip/api";
import { loadAdminDepartments, updateDepartment } from "@/lib/help-slip/settings";
import { departmentPatchSchema, firstIssue } from "@/lib/help-slip/validation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PATCH — rename a department, or retire it.
 *
 * There is no DELETE, deliberately. Concerns reference `department_id`, and a
 * deleted department would orphan every concern ever filed against it —
 * including closed ones somebody may need to look up next year. `status` is how
 * a department stops being offered: `loadDepartments` (the raise form's
 * dropdown) returns active rows only, so an inactive one disappears from the
 * form while every historical concern keeps its name.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("That department no longer exists.", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Couldn't read that request.", 400);
  }

  const parsed = departmentPatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "PATCH /api/help-slip/settings/departments/[id]",
    async (db, session) => {
      if (session.role !== "admin") {
        throw new HelpSlipForbiddenError("Only an admin can change a department.");
      }
      await updateDepartment(db, id, parsed.data);
      // The whole list back, so the row's concern count and sort position are
      // right without a second request.
      return { departments: await loadAdminDepartments(db) };
    },
    "Couldn't save that department. Check your connection and try again.",
  );
}
