import type { NextRequest } from "next/server";

import { jsonError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { loadDepartments } from "@/lib/help-slip/queries";
import { updateOwnProfile } from "@/lib/help-slip/settings";
import { firstIssue, profilePatchSchema } from "@/lib/help-slip/validation";

/**
 * Your own profile. No role check anywhere in this file, on purpose: everybody
 * has one, and `profiles_update_self` plus the final branch of
 * `guard_profile_columns` leave exactly name / phone / avatar writable by the
 * row's owner and nothing else.
 *
 * The id is taken from the SESSION, never from the body — which is why this is
 * a separate route from `users/[id]` rather than a special case inside it, and
 * why `profilePatchSchema` has no role, department or status field to smuggle.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/settings/profile",
    async (db, session) => ({
      profile: session,
      departments: await loadDepartments(db),
    }),
    "Couldn't load your profile. Check your connection and try again.",
  );
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Couldn't read that request.", 400);
  }

  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "PATCH /api/help-slip/settings/profile",
    async (db, session) => ({
      user: await updateOwnProfile(db, session.profileId, parsed.data),
    }),
    "Couldn't save your profile. Check your connection and try again.",
  );
}
