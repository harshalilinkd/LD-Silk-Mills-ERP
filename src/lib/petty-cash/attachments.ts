import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { ATTACHMENT_MAX_BYTES } from "./money";

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

/**
 * The uploaded file's own extension, sanitised — any type is accepted, so
 * there is no fixed MIME→extension table to fall back on anymore. Anything
 * that is not a short run of letters/digits is dropped rather than trusted:
 * the value comes from a filename a browser handed us.
 */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "bin";
  const ext = fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.length > 0 && ext.length <= 10 ? ext : "bin";
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Petty Cash attachments need it — see CLAUDE.md.`,
    );
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
 * The uploader's filename is NEVER part of the path beyond its extension. It
 * can contain slashes, which would silently reshape it, and it can carry a
 * payee's name into a string that ends up in logs. Foldered by month so a
 * year of receipts is not one flat directory.
 */
function pathFor(fileName: string, monthKey: string): string {
  return `entries/${monthKey}/${crypto.randomUUID()}.${extensionOf(fileName)}`;
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
  if (
    !/^entries\/\d{4}-(0[1-9]|1[0-2]|unknown)\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(
      path,
    )
  ) {
    return false;
  }
  const expected = Buffer.from(signPath(path));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Authorise one upload of one file to one path.
 *
 * Size is checked here as well as on the bucket: the bucket's own refusal is
 * a Supabase error blob, and somebody filling in an expense form deserves a
 * sentence. It is checked in the browser too — that one is a courtesy, this
 * one decides. There is no type restriction: a receipt arrives in whatever
 * format it arrives in.
 */
export async function signReceiptUpload(
  fileName: string,
  size: number,
  monthKey: string,
): Promise<{ ok: true; upload: SignedUpload } | { ok: false; error: string }> {
  if (!Number.isFinite(size) || size <= 0)
    return { ok: false, error: "That file is empty." };
  if (size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "That file is larger than 50 MB." };
  }

  const path = pathFor(
    fileName,
    /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : "unknown",
  );
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
    console.error(
      "petty-cash upload sign failed",
      res.status,
      await res.text(),
    );
    return {
      ok: false,
      error: "Could not start that upload. Please try again.",
    };
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

/**
 * The object's real size and type, straight from storage — checked before a
 * row claims it. `null` when nothing is there. Size and content type come
 * from here rather than from what the browser reported when it started the
 * upload, because that value was never verified against what actually landed.
 */
export async function statAttachment(
  path: string,
): Promise<{ size: number; contentType: string } | null> {
  const res = await storageFetch(path, { method: "HEAD" });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length"));
  return {
    size: Number.isFinite(len) ? len : 0,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
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
 * Remove a stored file. Best-effort, and always AFTER the column has been
 * cleared: the row is the record of truth, an orphaned object costs kilobytes,
 * and a row pointing at a file that was deleted first is a broken link on a
 * screen.
 */
export async function deleteAttachment(path: string): Promise<void> {
  try {
    const res = await storageFetch(path, { method: "DELETE" });
    if (!res.ok)
      console.error("petty-cash attachment delete failed", res.status);
  } catch (e) {
    console.error("petty-cash attachment delete threw", e);
  }
}

/**
 * Create the bucket if it is not there, and (re)apply its size limit either
 * way. Idempotent; run from a setup script, and safe to re-run whenever
 * `ATTACHMENT_MAX_BYTES` changes — an existing bucket keeps whatever limit it
 * was created with until something pushes the new one to it.
 *
 * No `allowed_mime_types` on either request: any file type is accepted.
 */
export async function ensureBucket(): Promise<{
  created: boolean;
  message: string;
}> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Content-Type": "application/json",
  };

  const created = await fetch(`${env("SUPABASE_URL")}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: ATTACHMENT_MAX_BYTES,
    }),
  });
  if (created.ok) return { created: true, message: `created ${BUCKET}` };

  const body = await created.text();
  if (created.status !== 409 && !/already exists/i.test(body)) {
    throw new Error(`could not create ${BUCKET}: ${created.status} ${body}`);
  }

  const updated = await fetch(
    `${env("SUPABASE_URL")}/storage/v1/bucket/${BUCKET}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        public: false,
        file_size_limit: ATTACHMENT_MAX_BYTES,
        // Explicit null, not omitted: Supabase keeps an existing restriction on
        // a PUT that simply leaves the field out.
        allowed_mime_types: null,
      }),
    },
  );
  if (!updated.ok) {
    throw new Error(
      `could not update ${BUCKET}: ${updated.status} ${await updated.text()}`,
    );
  }
  return {
    created: false,
    message: `${BUCKET} already existed, limits updated`,
  };
}
