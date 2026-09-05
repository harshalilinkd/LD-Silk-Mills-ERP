import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { pettyCashDb } from "@/db/petty-cash";
import { transactions } from "@/db/petty-cash/schema";
import { fetchAttachmentBytes } from "@/lib/petty-cash/attachments";
import { resolvePettyCashViewer } from "@/lib/petty-cash/authz";

/**
 * The receipt on one entry, streamed.
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
 * Addressed by ENTRY id, never by storage path. A path in a URL is a path
 * somebody can edit, and the row is where permission is decided anyway.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) return new NextResponse("Not permitted", { status: 403 });

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [row] = await pettyCashDb
    .select({ path: transactions.attachmentPath, name: transactions.attachmentName })
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .limit(1);

  // A missing entry and an entry with no receipt are the same answer to the
  // caller: there is nothing here. Telling them apart would confirm which ids
  // exist to somebody probing.
  if (!row?.path) return new NextResponse("Not found", { status: 404 });

  const file = await fetchAttachmentBytes(row.path);
  if (!file) {
    // The row says there is a receipt and storage disagrees. That is worth
    // saying plainly rather than pretending the entry has none — somebody has
    // to go and find out where it went.
    console.error("petty-cash: attachment missing from storage", { id, path: row.path });
    return new NextResponse("The stored receipt could not be found.", { status: 404 });
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
