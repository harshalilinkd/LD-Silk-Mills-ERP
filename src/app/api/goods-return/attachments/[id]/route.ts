import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { goodsReturnDb } from "@/db/goods-return";
import { returns } from "@/db/goods-return/schema";
import {
  fetchAttachmentBytes,
  isStoragePath,
} from "@/lib/goods-return/attachments";
import { canOpenGoodsReturn } from "@/lib/goods-return/authz";

/**
 * The file on a return, streamed.
 *
 * ── WHY IT IS PROXIED RATHER THAN LINKED ─────────────────────────────────
 *
 * The obvious alternative is a Supabase signed URL handed to the browser, and
 * it is rejected for the reason Help Slip rejected it: a signed URL is a bearer
 * token in a query string. It works for anyone holding it, for its whole
 * lifetime, with no further check — so it survives being pasted into WhatsApp,
 * and these files are bills carrying party names and amounts.
 *
 * Streaming through here means every view is re-authorised, and revoking
 * somebody's Goods Return access revokes their files immediately rather than
 * whenever a URL happens to expire.
 *
 * Addressed by RETURN id, not by file path. A path in the URL is a path
 * somebody can edit, and the row is where permission is decided anyway.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await canOpenGoodsReturn();
  if (!access) return new NextResponse("Not permitted", { status: 403 });

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [row] = await goodsReturnDb
    .select({ url: returns.attachmentUrl })
    .from(returns)
    .where(eq(returns.id, id))
    .limit(1);

  // A missing row and a row with no file are the same answer to the caller:
  // there is nothing here. Distinguishing them would confirm which return ids
  // exist to somebody probing.
  if (!row?.url || !isStoragePath(row.url)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await fetchAttachmentBytes(row.url);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      // inline: a bill is something you glance at, not something you download.
      "Content-Disposition": "inline",
      // Private and short. The bytes are re-authorised on every request, so a
      // long-lived cache would outlive the permission that fetched it.
      "Cache-Control": "private, max-age=60",
    },
  });
}
