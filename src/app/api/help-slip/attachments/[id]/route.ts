import type { NextRequest } from "next/server";

import { jsonData, jsonError } from "@/lib/help-slip/api";
import { withCurrentUser } from "@/lib/help-slip/authz";
import {
  deleteAttachment,
  deleteFromStorage,
  fetchAttachmentBytes,
  loadAttachmentForDownload,
} from "@/lib/help-slip/attachments";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ONE attachment — look at it, or remove it.
 *
 * ── WHY THE FILE IS PROXIED RATHER THAN LINKED ────────────────────────────
 *
 * The obvious alternative is a Supabase signed URL handed to the browser. It is
 * rejected here for one reason: a signed URL is a BEARER TOKEN in a query
 * string. It works for anyone holding it, for its whole lifetime, with no
 * further check — so it survives being pasted into WhatsApp, and these
 * photographs can be attached to `hr_only` concerns. That is precisely the
 * confidentiality the RLS model exists to protect.
 *
 * Streaming through this route means every single view is re-authorised
 * against the database, and revoking access revokes it immediately rather than
 * whenever the URL happens to expire.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response(null, { status: 404 });

  try {
    // RLS returns zero rows for an attachment on a concern this person cannot
    // read, so "not allowed" and "does not exist" produce the identical 404.
    const row = await withCurrentUser((db) =>
      loadAttachmentForDownload(db, id),
    );
    if (!row) return new Response(null, { status: 404 });

    const upstream = await fetchAttachmentBytes(row.filePath);
    if (!upstream.ok || !upstream.body) {
      // The row exists but the object does not. Reachable only for a file
      // deleted out from under us; a 404 is the honest answer.
      return new Response(null, { status: 404 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": row.mimeType ?? "application/octet-stream",
        // `inline` so it opens in a tab instead of downloading. The filename is
        // quoted and stripped of path separators upstream.
        "Content-Disposition": `inline; filename="${row.fileName.replace(/"/g, "")}"`,
        // PRIVATE, and never shared. A proxy caching this would hand one
        // employee's photograph to the next person who asked for the same id.
        "Cache-Control": "private, max-age=300, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "NotProvisionedError") {
      return new Response(null, { status: 403 });
    }
    console.error("GET /api/help-slip/attachments/[id] failed:", e);
    return new Response(null, { status: 500 });
  }
}

/**
 * DELETE — remove a photo.
 *
 * Who may is decided ENTIRELY by the `attachments_delete` policy
 * (`uploaded_by = auth.uid() OR my_role() = 'admin'`), not re-implemented here.
 * Zero rows back means it refused, and the object is then left untouched —
 * deleting the file after a refused row delete would destroy a photograph the
 * caller was not allowed to remove.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("That photo couldn't be found.", 404);

  try {
    const filePath = await withCurrentUser((db) => deleteAttachment(db, id));
    if (!filePath) {
      return jsonError("You can't remove that photo.", 403);
    }
    // Row first, object second. The other order can leave a row pointing at
    // nothing if the delete is refused.
    await deleteFromStorage(filePath);
    return jsonData({ removed: true });
  } catch (e) {
    if (e instanceof Error && e.name === "NotProvisionedError") {
      return jsonError(
        "Your account isn't set up in Help Slip yet. Ask an admin to add you.",
        403,
      );
    }
    console.error("DELETE /api/help-slip/attachments/[id] failed:", e);
    return jsonError("That photo couldn't be removed. Try again.", 500);
  }
}
