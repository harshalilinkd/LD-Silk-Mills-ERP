import type { NextRequest } from "next/server";

import {
  HelpSlipForbiddenError,
  jsonError,
  withHelpSlipRoute,
} from "@/lib/help-slip/api";
import { loadSettings, saveSettings } from "@/lib/help-slip/settings";
import { firstIssue, generalSettingsSchema } from "@/lib/help-slip/validation";

/**
 * GET — the one settings row.
 *
 * `app_settings_select` is `using (true)`, because `v_concerns` is
 * security_invoker and needs the SLA windows on every query — so this row is
 * already readable by everyone. The privilege is entirely on the write.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/settings/general",
    async (db) => ({ settings: await loadSettings(db) }),
    "Couldn't load settings. Check your connection and try again.",
  );
}

/**
 * PUT — save the whole blob.
 *
 * The form holds every field and the row is a singleton edited by one admin at
 * a time, so a per-field patch would add a failure mode — a half-written blob —
 * to buy nothing. The SLA days are the reason this is a jsonb column at all
 * (D6): they had to become editable without a migration, and `v_concerns`
 * reads them on every query, so a change here moves every open concern's due
 * date the moment it is saved.
 */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Couldn't read that request.", 400);
  }

  const parsed = generalSettingsSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 422);

  return withHelpSlipRoute(
    "PUT /api/help-slip/settings/general",
    async (db, session) => {
      if (session.role !== "admin") {
        throw new HelpSlipForbiddenError("Only an admin can change settings.");
      }
      return { settings: await saveSettings(db, parsed.data) };
    },
    "Couldn't save settings. Check your connection and try again.",
  );
}
