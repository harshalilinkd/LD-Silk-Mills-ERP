import type { NextRequest } from "next/server";

import { jsonError, withHelpSlipRoute } from "@/lib/help-slip/api";
import {
  countUnreadNotifications,
  loadNotificationsPage,
  markNotificationsRead,
} from "@/lib/help-slip/queries";

/**
 * GET /api/help-slip/notifications — one keyset page of the notification
 * centre, `in_app` only.
 *
 * `before` is the `created_at` of the last row already on screen. Keyset
 * rather than an offset because notifications ARRIVE while somebody is
 * reading: an offset-based page 2 would skip whatever the new rows pushed
 * down, and a cursor on the timestamp cannot.
 */
export async function GET(req: NextRequest) {
  const before = req.nextUrl.searchParams.get("before");

  return withHelpSlipRoute(
    "GET /api/help-slip/notifications",
    (db, session) => loadNotificationsPage(db, session, before || null),
    "Could not load your notifications.",
  );
}

/**
 * PATCH /api/help-slip/notifications — mark one read, or all of them.
 *
 * Marking read is a DECISION, never something that happens to the reader on
 * arrival. The standalone app used to clear everything on visiting the centre,
 * which destroyed the unread styling before anyone had read a row — the one
 * thing they came for. So: tapping a row, or pressing "Mark all read". Nothing
 * else.
 *
 * The response carries the fresh unread count, so the badge and the list stay
 * in step without a second request racing this one.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { id?: string; all?: boolean }
    | null;

  if (!body || (!body.all && typeof body.id !== "string")) {
    return jsonError("Send either { id } or { all: true }.", 422);
  }

  return withHelpSlipRoute(
    "PATCH /api/help-slip/notifications",
    async (db, session) => {
      await markNotificationsRead(
        db,
        session,
        body.all ? { all: true } : { id: body.id as string },
      );
      return { unread: await countUnreadNotifications(db, session) };
    },
    "That didn't save. Nothing was changed.",
  );
}
