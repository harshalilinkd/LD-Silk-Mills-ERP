import type { NextRequest } from "next/server";

import {
  HelpSlipForbiddenError,
  jsonError,
  withHelpSlipRoute,
} from "@/lib/help-slip/api";
import { createDepartment, loadAdminDepartments } from "@/lib/help-slip/settings";
import { departmentCreateSchema, firstIssue } from "@/lib/help-slip/validation";

/**
 * GET — every department, active or not, with how many concerns have been
 * filed against each.
 *
 * The count is context, not a metric: it is the number an admin needs before
 * retiring one. A department with 400 concerns behind it should not be
 * deactivated on a whim, and a department with 0 probably never should have
 * existed.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/settings/departments",
    async (db, session) => {
      if (session.role !== "admin") {
        throw new HelpSlipForbiddenError("Only an admin can manage departments.");
      }
      return { departments: await loadAdminDepartments(db) };
    },
    "Couldn't load departments. Check your connection and try again.",
  );
}

/** POST — add one. `code` is the stable handle; `name` is what people read. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Couldn't read that request.", 400);
  }

  const parsed = departmentCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "POST /api/help-slip/settings/departments",
    async (db, session) => {
      if (session.role !== "admin") {
        throw new HelpSlipForbiddenError("Only an admin can add a department.");
      }
      return { department: await createDepartment(db, parsed.data) };
    },
    "Couldn't add that department. Check your connection and try again.",
  );
}
