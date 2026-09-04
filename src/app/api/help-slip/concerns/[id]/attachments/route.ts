import type { NextRequest } from "next/server";

import { jsonData, jsonError, withHelpSlipRoute } from "@/lib/help-slip/api";
import { withCurrentUser } from "@/lib/help-slip/authz";
import {
  ACCEPTED_MIME,
  MAX_BYTES,
  assertCanAttach,
  deleteFromStorage,
  loadAttachments,
  recordAttachment,
  safeDisplayName,
  storagePathFor,
  uploadToStorage,
} from "@/lib/help-slip/attachments";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Photos on one concern.
 *
 * GET  — list them (RLS decides what exists).
 * POST — add one, as multipart/form-data with a single `file` part.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Same answer as a real id belonging to somebody else. Never a 400 here —
  // a different response for a malformed id is still a different response.
  if (!UUID_RE.test(id)) return jsonData([]);

  return withHelpSlipRoute(
    "GET /api/help-slip/concerns/[id]/attachments",
    (db, session) => loadAttachments(db, session, id),
    "Couldn't load the photos on this concern.",
  );
}

/**
 * POST — upload one photo.
 *
 * ── WHY THIS ROUTE OPENS TWO RLS TRANSACTIONS ─────────────────────────────
 *
 * Everywhere else in this module the rule is ONE `withHelpSlipRoute` per
 * request (see the concurrency note in `src/db/help-slip/rls.ts` — the pool is
 * capped at 5 and these transactions pin a connection). This handler breaks
 * that rule on purpose, and it is the only one that does:
 *
 *   1. ask Postgres whether this person may attach to this concern
 *   2. write the bytes to storage        <- NOT a database operation
 *   3. record the row, RLS deciding again
 *
 * The upload sits BETWEEN two database calls and cannot be inside either. The
 * two transactions are SEQUENTIAL, never concurrent, so they occupy one
 * connection at a time — the pool exhaustion the rule guards against comes
 * from parallel calls, not from two in a row.
 *
 * The order matters and the other orders are worse. Checking after uploading
 * would let somebody push files into a bucket path for a concern they cannot
 * see. Inserting the row first and uploading after would leave a row pointing
 * at a file that does not exist — a permanently broken thumbnail — whereas
 * this way a failure leaves an orphaned OBJECT, which no screen can see and
 * which is cleaned up immediately below.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id))
    return jsonError("That concern couldn't be found.", 404);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return jsonError("That upload didn't arrive properly. Try again.", 400);
  }
  if (!file) return jsonError("No photo was attached.", 400);

  const mime = file.type || "application/octet-stream";
  if (!(ACCEPTED_MIME as readonly string[]).includes(mime)) {
    return jsonError("Attach a photo — JPG, PNG, WEBP or HEIC.", 415);
  }
  if (file.size === 0) return jsonError("That photo is empty.", 400);
  if (file.size > MAX_BYTES) {
    return jsonError(
      `That photo is ${(file.size / 1048576).toFixed(1)}MB. The limit is ${MAX_BYTES / 1048576}MB.`,
      413,
    );
  }

  const path = storagePathFor(id, mime);
  const displayName = safeDisplayName(file.name);

  try {
    // (1) permission — before a single byte reaches storage
    const session = await withCurrentUser(async (db, s) => {
      await assertCanAttach(db, s, id);
      return s;
    });

    // (2) the bytes
    await uploadToStorage(path, await file.arrayBuffer(), mime);

    // (3) the row. RLS decides again; zero rows back means it refused, and
    //     the object is removed rather than left orphaned in the bucket.
    const ok = await withCurrentUser((db) =>
      recordAttachment(db, {
        concernId: id,
        filePath: path,
        fileName: displayName,
        fileSizeBytes: file.size,
        mimeType: mime,
        uploadedBy: session.profileId,
      }),
    );
    if (!ok) {
      await deleteFromStorage(path);
      return jsonError("You can't add photos to this concern.", 403);
    }

    const list = await withCurrentUser((db, s) => loadAttachments(db, s, id));
    return jsonData(list, 201);
  } catch (e) {
    await deleteFromStorage(path);
    // HelpSlipRejectedError carries a sentence written for the screen; anything
    // else could quote a query, and a query here can quote a confidential
    // concern's title.
    if (e instanceof Error && e.name === "HelpSlipRejectedError") {
      return jsonError(e.message, 422);
    }
    if (e instanceof Error && e.name === "NotProvisionedError") {
      return jsonError(
        "Your account isn't set up in Help Slip yet. Ask an admin to add you.",
        403,
      );
    }
    console.error("POST /api/help-slip/concerns/[id]/attachments failed:", e);
    return jsonError("That photo didn't upload. Try again.", 500);
  }
}
