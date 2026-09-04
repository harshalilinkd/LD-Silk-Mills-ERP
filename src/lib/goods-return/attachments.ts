import "server-only";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The bill or lorry receipt attached to a return
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── A PRIVATE BUCKET, WHICH IS A DEPARTURE FROM THE STANDALONE APP ───────
 *
 * That app uploads to a PUBLIC Supabase bucket and stores `getPublicUrl()` in
 * `returns.attachment_url`. A public URL is permanent, unauthenticated and
 * guessable-adjacent: anybody holding it sees the file forever, and the files
 * here are bills and lorry receipts carrying party names and amounts.
 *
 * It cost nothing to do better — the feature has existed for the life of that
 * app and **not one file has ever been uploaded**, so there was no migration to
 * weigh against it. New bucket, `goods-return-attachments`, private, 10 MB,
 * images and PDF only. Files stream through an API route that re-checks access
 * on every view, which is the same call Help Slip made and for the same reason:
 * a signed URL is a bearer token in a query string that survives being pasted
 * into WhatsApp.
 *
 * ── BOTH SHAPES OF `attachment_url` ARE UNDERSTOOD ───────────────────────
 *
 * The column holds a STORAGE PATH for anything uploaded here. It may also hold
 * a full `https://…` public URL, if somebody uploads through the standalone app
 * while both are running. `isStoragePath()` tells them apart so the detail
 * screen can link to the proxy for one and straight out for the other, rather
 * than rendering a broken link for whichever it did not expect.
 */

const BUCKET = "goods-return-attachments";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export const ACCEPTED_MIME = Object.keys(MIME_EXT);
export const MAX_BYTES = 10 * 1024 * 1024;

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Goods Return attachments need it — see CLAUDE.md.`,
    );
  }
  return v;
}

/**
 * The only door to the storage service.
 *
 * Module-private on purpose: the service-role key bypasses every storage
 * policy, so nothing outside this file should be able to reach the bucket.
 */
async function storageFetch(
  path: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/storage/v1/object/${BUCKET}/${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}`, apikey: key },
    cache: "no-store",
  });
}

/** True for a path we stored; false for a legacy public URL. */
export function isStoragePath(v: string | null): boolean {
  return !!v && !/^https?:\/\//i.test(v);
}

/**
 * `returns/{id}/{uuid}.{ext}`.
 *
 * The uploader's own filename is NEVER used. It can contain slashes, which
 * would silently reshape the path, and it can carry a party's name into a
 * string that ends up in logs.
 */
function pathFor(returnId: number, mime: string): string {
  return `returns/${returnId}/${crypto.randomUUID()}.${MIME_EXT[mime] ?? "bin"}`;
}

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Store one file and hand back the path to put in `attachment_url`.
 *
 * Type and size are checked HERE as well as on the bucket. The bucket's own
 * limits return a Supabase error blob that means nothing to somebody looking at
 * an entry form; these produce a sentence.
 */
export async function uploadAttachment(
  returnId: number,
  file: File,
): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That file is larger than 10 MB." };
  }
  if (!ACCEPTED_MIME.includes(file.type)) {
    return {
      ok: false,
      error: "Attach a photo (JPG, PNG, WEBP, HEIC) or a PDF.",
    };
  }

  const path = pathFor(returnId, file.type);
  const res = await storageFetch(path, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!res.ok) {
    console.error("goods-return attachment upload failed", res.status, await res.text());
    return { ok: false, error: "Could not store that file. Please try again." };
  }
  return { ok: true, path };
}

export type AttachmentBytes = {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
};

/** Stream one file back. Callers MUST have checked access first. */
export async function fetchAttachmentBytes(
  path: string,
): Promise<AttachmentBytes | null> {
  const res = await storageFetch(path, { method: "GET" });
  if (!res.ok) return null;
  return {
    body: res.body,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * Remove a stored file. Best-effort by design.
 *
 * The database row is the record of truth. An orphaned object costs a few
 * kilobytes; a row pointing at a file that was deleted first is a broken link
 * on a screen. So this is always called AFTER the column has been cleared, and
 * a failure here is logged rather than surfaced.
 */
export async function deleteAttachment(path: string): Promise<void> {
  try {
    const res = await storageFetch(path, { method: "DELETE" });
    if (!res.ok) {
      console.error("goods-return attachment delete failed", res.status);
    }
  } catch (e) {
    console.error("goods-return attachment delete threw", e);
  }
}
