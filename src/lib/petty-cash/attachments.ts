import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Receipts go BROWSER → STORAGE, not browser → us → storage
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The first version sent the file inside the server action's FormData, and it
 * broke on the first real receipt with:
 *
 *     Body exceeded 1 MB limit
 *
 * That is Next's default cap on a Server Action body. Raising it is the
 * obvious fix and it is the wrong one: **Vercel refuses any request body over
 * 4.5 MB** at the platform, before our code runs, so the 10 MB this module
 * promises could never have worked through a function no matter what Next was
 * configured to allow.
 *
 * So the bytes never pass through us. The server issues a SIGNED UPLOAD URL —
 * one path, one use, short-lived — the browser PUTs the file straight to
 * Supabase Storage, and the form then submits nothing but the path. The action
 * body goes back to a few hundred bytes.
 *
 * ── WHAT THIS DOES NOT GIVE AWAY ─────────────────────────────────────────
 *
 *   · The bucket stays PRIVATE and the service-role key stays here. The signed
 *     URL is scoped to one path, cannot list, cannot read, and expires.
 *   · The URL is only issued after `requirePettyCashCreate()` / `…Edit()`.
 *   · The path is built HERE, from a UUID, and comes back with an HMAC over
 *     it. `verifySignedPath` re-checks that signature before any path is
 *     written to a row — so a client cannot hand us a path we never issued and
 *     point its entry at somebody else's receipt.
 *   · Reading is unchanged: still the proxy route, still re-authorised on
 *     every view, still never a signed READ url.
 */

export type SignedUpload = {
  /** Absolute; PUT the bytes here with the file's Content-Type and no auth. */
  uploadUrl: string;
  path: string;
  /** Hand back with the form. `verifySignedPath` will not take a path without it. */
  signature: string;
  /** The uploader's own filename, cleaned, for display on the entry. */
  name: string;
};

/** HMAC over the path, so only a path WE issued can be attached to an entry. */
function signPath(path: string): string {
  return createHmac("sha256", env("AUTH_SECRET")).update(path).digest("hex");
}

export function verifySignedPath(path: string, signature: string): boolean {
  if (!path || !signature) return false;
  // Shape first: anything that is not our own layout is refused before the
  // comparison, so a traversal attempt never reaches storage.
  if (!/^entries\/\d{4}-(0[1-9]|1[0-2]|unknown)\/[0-9a-f-]{36}\.[a-z]{3,4}$/.test(path)) {
    return false;
  }
  const expected = Buffer.from(signPath(path));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Authorise one upload of one file to one path.
 *
 * Type and size are checked here as well as on the bucket: the bucket's own
 * refusal is a Supabase error blob, and somebody filling in an expense form
 * deserves a sentence. They are checked in the browser too — that one is a
 * courtesy, this one decides.
 */
export async function signReceiptUpload(
  fileName: string,
  contentType: string,
  size: number,
  monthKey: string,
): Promise<{ ok: true; upload: SignedUpload } | { ok: false; error: string }> {
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "That file is empty." };
  if (size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "That file is larger than 10 MB." };
  }
  if (!(ATTACHMENT_MIME as readonly string[]).includes(contentType)) {
    return { ok: false, error: "Attach a photo (JPG, PNG, WEBP, HEIC) or a PDF." };
  }

  const path = pathFor(contentType, /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : "unknown");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(
    `${env("SUPABASE_URL")}/storage/v1/object/upload/sign/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    },
  );
  if (!res.ok) {
    console.error("petty-cash upload sign failed", res.status, await res.text());
    return { ok: false, error: "Could not start that upload. Please try again." };
  }
  const { url } = (await res.json()) as { url: string };

  // The original name is kept for DISPLAY only, trimmed of any path parts.
  const name = (fileName || "receipt").split(/[\\/]/).pop()!.slice(0, 255);
  return {
    ok: true,
    upload: {
      uploadUrl: `${env("SUPABASE_URL")}/storage/v1${url}`,
      path,
      signature: signPath(path),
      name,
    },
  };
}

/** True when the object is really there — checked before a row claims it. */
export async function attachmentExists(path: string): Promise<boolean> {
  const res = await storageFetch(path, { method: "HEAD" });
  return res.ok;
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
