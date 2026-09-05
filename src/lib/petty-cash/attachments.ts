import "server-only";

import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME } from "./money";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The bill or voucher attached to an entry
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The same shape Goods Return and Help Slip already use, and for the same
 * reasons — this is not a new mechanism, it is the ERP's one mechanism pointed
 * at a second bucket.
 *
 *   · A PRIVATE bucket. The old app puts receipts in Google Drive; these are
 *     bills carrying names and amounts, and a public URL is permanent and
 *     unauthenticated.
 *   · Uploaded by the SERVER with the service-role key, which never leaves the
 *     server and is confined to this file so nothing else can reach the bucket.
 *   · Read back through an API route that re-checks permission on every view,
 *     rather than a signed URL — a signed URL is a bearer token in a query
 *     string that survives being pasted into WhatsApp.
 */

const BUCKET = "petty-cash-attachments";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Petty Cash attachments need it — see CLAUDE.md.`);
  }
  return v;
}

/** The only door to storage. Module-private: the key bypasses every policy. */
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

/**
 * `entries/{yyyy-mm}/{uuid}.{ext}`.
 *
 * The uploader's filename is NEVER part of the path. It can contain slashes,
 * which would silently reshape it, and it can carry a payee's name into a
 * string that ends up in logs. Foldered by month so a year of receipts is not
 * one flat directory.
 */
function pathFor(mime: string, monthKey: string): string {
  return `entries/${monthKey}/${crypto.randomUUID()}.${MIME_EXT[mime] ?? "bin"}`;
}

export type UploadResult =
  | { ok: true; path: string; name: string }
  | { ok: false; error: string };

/**
 * Store one file. Type and size are checked here as well as on the bucket:
 * the bucket's own refusal is a Supabase error blob, and somebody filling in
 * an expense form deserves a sentence.
 */
export async function uploadAttachment(
  file: File,
  monthKey: string,
): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "That file is larger than 10 MB." };
  }
  if (!(ATTACHMENT_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Attach a photo (JPG, PNG, WEBP, HEIC) or a PDF." };
  }

  const path = pathFor(file.type, monthKey);
  const res = await storageFetch(path, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!res.ok) {
    console.error("petty-cash attachment upload failed", res.status, await res.text());
    return { ok: false, error: "Could not store that file. Please try again." };
  }
  // The original name is kept for DISPLAY only, trimmed of any path parts.
  const name = (file.name || "receipt").split(/[\\/]/).pop()!.slice(0, 255);
  return { ok: true, path, name };
}

export type AttachmentBytes = {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
};

/** Stream one file back. Callers MUST have checked access first. */
export async function fetchAttachmentBytes(path: string): Promise<AttachmentBytes | null> {
  const res = await storageFetch(path, { method: "GET" });
  if (!res.ok) return null;
  return {
    body: res.body,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * Remove a stored file. Best-effort, and always AFTER the column has been
 * cleared: the row is the record of truth, an orphaned object costs kilobytes,
 * and a row pointing at a file that was deleted first is a broken link on a
 * screen.
 */
export async function deleteAttachment(path: string): Promise<void> {
  try {
    const res = await storageFetch(path, { method: "DELETE" });
    if (!res.ok) console.error("petty-cash attachment delete failed", res.status);
  } catch (e) {
    console.error("petty-cash attachment delete threw", e);
  }
}

/** Create the bucket if it is not there. Idempotent; run from a setup script. */
export async function ensureBucket(): Promise<{ created: boolean; message: string }> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: ATTACHMENT_MAX_BYTES,
      allowed_mime_types: ATTACHMENT_MIME,
    }),
  });
  if (res.ok) return { created: true, message: `created ${BUCKET}` };
  const body = await res.text();
  if (res.status === 409 || /already exists/i.test(body)) {
    return { created: false, message: `${BUCKET} already exists` };
  }
  throw new Error(`could not create ${BUCKET}: ${res.status} ${body}`);
}
