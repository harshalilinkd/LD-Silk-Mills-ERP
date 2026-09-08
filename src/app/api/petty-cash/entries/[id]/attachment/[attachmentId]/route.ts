import { NextResponse, type NextRequest } from "next/server";

import { fetchAttachmentBytes } from "@/lib/petty-cash/attachments";
import { resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import {
  getEntryAttachment,
  getLegacyAttachment,
} from "@/lib/petty-cash/queries";

/**
 * ONE receipt on one entry, streamed.
 *
 * ── PROXIED, NOT LINKED ──────────────────────────────────────────────────
 *
 * The obvious alternative is a Supabase signed URL handed to the browser, and
 * it is rejected for the reason Goods Return and Help Slip both rejected it: a
 * signed URL is a bearer token in a query string. It works for anyone holding
 * it, for its whole lifetime, with no further check — so it survives being
 * pasted into WhatsApp, and these are bills carrying names and amounts.
 *
 * Streaming through here means every view is re-authorised, and taking away
 * somebody's Petty Cash access takes away their receipts immediately rather
 * than whenever a URL happens to expire.
 *
 * Addressed by ENTRY id plus attachment id, never by storage path. A path in
 * a URL is a path somebody can edit, and the row is where permission and
 * ownership are decided anyway. `attachmentId` is either an
 * `entry_attachments.id` — checked to belong to THIS entry — or the literal
 * `legacy`, for an entry saved before that table existed.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) return new NextResponse("Not permitted", { status: 403 });

  const { id: rawId, attachmentId: rawAttachmentId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A missing entry, a missing attachment, and an attachment that belongs to
  // somebody else's entry are all the same answer to the caller: there is
  // nothing here. Telling them apart would confirm which ids exist.
  const found =
    rawAttachmentId === "legacy"
      ? await getLegacyAttachment(id)
      : Number.isInteger(Number(rawAttachmentId))
        ? await getEntryAttachment(id, Number(rawAttachmentId))
        : null;
  if (!found) return new NextResponse("Not found", { status: 404 });

  const path = "path" in found ? found.path : found.filePath;
  const file = await fetchAttachmentBytes(path);
  if (!file) {
    // The row says there is a receipt and storage disagrees. That is worth
    // saying plainly rather than pretending the entry has none — somebody has
    // to go and find out where it went.
    console.error("petty-cash: attachment missing from storage", { id, path });
    return new NextResponse("The stored receipt could not be found.", {
      status: 404,
    });
  }

  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      // inline: a bill is glanced at, not downloaded.
      "Content-Disposition": "inline",
      // Private and short. The bytes are re-authorised on every request, so a
      // long cache would outlive the permission that fetched them.
      "Cache-Control": "private, max-age=60",
    },
  });
}
