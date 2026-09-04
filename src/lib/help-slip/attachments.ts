import "server-only";

import { and, eq } from "drizzle-orm";

import type { HelpSlipDb } from "@/db/help-slip/rls";
import { concernAttachments, concerns } from "@/db/help-slip/schema";
import type { HelpSlipSession } from "@/lib/help-slip/authz";
import { isStaff } from "@/lib/help-slip/authz";
import { HelpSlipRejectedError } from "@/lib/help-slip/api";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Photo attachments on a concern
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The last functional gap between this shell and the standalone Help Slip app:
 * somebody photographs a jammed loom and attaches it to the concern.
 *
 * Nothing here was provisioned by this repo. `ld_help_slip.concern_attachments`
 * and the private `concern-attachments` bucket already exist, already carry
 * RLS, and already hold rows written by the live app. This file joins that
 * arrangement; it does not redesign it. The storage path format is theirs and
 * must stay theirs — `{concern_id}/{uuid}.{ext}` — because the storage policies
 * parse the concern id out of the FIRST PATH SEGMENT
 * (`concern_id_from_storage_path`). A path shaped any other way silently
 * becomes unreadable to the other app.
 *
 * ── THE ONE THING TO UNDERSTAND BEFORE EDITING ────────────────────────────
 *
 * Storage RLS DOES NOT PROTECT US, because we cannot satisfy it.
 *
 * Those bucket policies are written against `auth.uid()`. The standalone app
 * has a real Supabase Auth session and passes the user's own access token, so
 * the policies apply to it. This ERP owns sign-in itself and holds no Supabase
 * JWT at all — the trick used everywhere else in this module (drop to the
 * `authenticated` role inside a transaction and inject the claim, see
 * `src/db/help-slip/rls.ts`) works only for Postgres. The Storage API is a
 * separate service and never sees that transaction.
 *
 * So every call in this file reaches storage with the SERVICE ROLE KEY, which
 * bypasses those policies completely. That is safe only because:
 *
 *   **the database is checked FIRST, under RLS, on every single path.**
 *
 * Upload asks Postgres whether this person may write to this concern. Download
 * asks Postgres for the row and gets zero rows if they may not see it. Delete
 * lets the RLS DELETE policy decide and only removes the object if a row
 * actually went. Postgres is the boundary; storage is a bucket of bytes.
 *
 * Never call `storageFetch` from anywhere that has not already been through
 * `withHelpSlip`. An unguarded call here reads any employee's confidential
 * HR photograph.
 */

const BUCKET = "concern-attachments";

/** Matches the standalone app. Three is a report, not an album. */
export const MAX_ATTACHMENTS = 3;

/** What a phone camera produces. HEIC comes off iPhones and is worth taking. */
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * Server-side ceiling, after the client has already compressed toward ~0.5MB.
 *
 * Generous on purpose: HEIC cannot be re-encoded by a canvas in most browsers,
 * so those arrive at their original size and rejecting them at 1MB would refuse
 * exactly the iPhone photographs the format list exists to accept.
 */
export const MAX_BYTES = 8 * 1024 * 1024;

export type AttachmentRow = {
  id: string;
  fileName: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  createdAt: string;
  /** Always served through our own route — never a storage URL. */
  url: string;
  /**
   * Whether THIS viewer may delete THIS photo.
   *
   * Computed on the server because the browser cannot: the client session
   * deliberately carries no profile id, so a component has no way to tell
   * whether it uploaded a given file. Mirrors `attachments_delete`
   * (`uploaded_by = auth.uid() OR my_role() = 'admin'`) exactly — and it is
   * only a rendering hint. The policy still decides; this just avoids showing
   * a button that would come back 403.
   */
  canRemove: boolean;
};

function env(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const v = process.env[name];
  if (!v) {
    // Loud and specific. A missing key here fails every upload with a 500 and
    // no clue, and the fix is one line in the environment.
    throw new Error(
      `${name} is not set. Help Slip photo attachments need it — see CLAUDE.md.`,
    );
  }
  return v;
}

/**
 * The only door to the storage service.
 *
 * Private by module scope on purpose. Every caller below has already asked
 * Postgres for permission; nothing outside this file should be able to reach
 * the bucket at all.
 */
async function storageFetch(
  path: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/storage/v1/object/${BUCKET}/${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${key}`,
      // Supabase's gateway wants both on service-role calls.
      apikey: key,
    },
    cache: "no-store",
  });
}

/** `{concern_id}/{uuid}.{ext}` — the format the storage policies parse. */
export function storagePathFor(concernId: string, mime: string): string {
  // The uploader's own filename is NEVER used in the path. Gallery names can
  // contain slashes, which would break the policy's first-segment parse, and
  // that parse is what decides who may read the file.
  const ext =
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
    }[mime] ?? "jpg";
  return `${concernId}/${crypto.randomUUID()}.${ext}`;
}

/** Display name, kept for the UI but never trusted as a path. */
export function safeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "photo";
  return base.slice(0, 120) || "photo";
}

// ─── reads ─────────────────────────────────────────────────────────────────

/**
 * Every attachment on a concern the caller may see.
 *
 * No explicit permission check, and none is needed: `attachments_select` is
 * `can_read_concern(concern_id)`, so a concern the caller cannot read yields
 * zero rows rather than an error. Same shape as everything else in this
 * module — invisible, not forbidden.
 */
export async function loadAttachments(
  db: HelpSlipDb,
  session: HelpSlipSession,
  concernId: string,
): Promise<AttachmentRow[]> {
  const rows = await db
    .select({
      id: concernAttachments.id,
      fileName: concernAttachments.fileName,
      fileSizeBytes: concernAttachments.fileSizeBytes,
      mimeType: concernAttachments.mimeType,
      uploadedBy: concernAttachments.uploadedBy,
      createdAt: concernAttachments.createdAt,
    })
    .from(concernAttachments)
    .where(eq(concernAttachments.concernId, concernId))
    .orderBy(concernAttachments.createdAt);

  return rows.map(({ uploadedBy, ...r }) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    // `file_path` deliberately does NOT leave the server. It is a storage
    // coordinate, and handing it out invites somebody to try it directly.
    url: `/api/help-slip/attachments/${r.id}`,
    // `uploadedBy` is destructured OUT rather than shipped. On an `hr_only`
    // concern the set of people who attached photographs is itself part of
    // what is confidential, and the screen never needs the id — only the
    // yes/no below.
    canRemove: uploadedBy === session.profileId || session.role === "admin",
  }));
}

/**
 * The stored row plus its path, for the file-serving route.
 *
 * Returns null when RLS says the caller cannot read the concern — the route
 * turns that into the same 404 a nonexistent id gets.
 */
export async function loadAttachmentForDownload(
  db: HelpSlipDb,
  attachmentId: string,
): Promise<{
  filePath: string;
  fileName: string;
  mimeType: string | null;
} | null> {
  const [row] = await db
    .select({
      filePath: concernAttachments.filePath,
      fileName: concernAttachments.fileName,
      mimeType: concernAttachments.mimeType,
    })
    .from(concernAttachments)
    .where(eq(concernAttachments.id, attachmentId))
    .limit(1);
  return row ?? null;
}

export async function fetchAttachmentBytes(
  filePath: string,
): Promise<Response> {
  return storageFetch(filePath, { method: "GET" });
}

// ─── writes ────────────────────────────────────────────────────────────────

/**
 * May this person add a photo to this concern, right now?
 *
 * Mirrors the two INSERT policies rather than replacing them — RLS still has
 * the final say on the insert itself. This exists so the check happens BEFORE
 * bytes are written to storage: without it, somebody could push files into a
 * bucket path for a concern they cannot see, and the insert failing afterwards
 * would leave the object behind.
 *
 * `attachments_insert_employee`: your own concern, and not closed.
 * `attachments_insert_staff`:    staff, on any concern they can read.
 */
export async function assertCanAttach(
  db: HelpSlipDb,
  session: HelpSlipSession,
  concernId: string,
): Promise<void> {
  const [row] = await db
    .select({ employeeId: concerns.employeeId, status: concerns.status })
    .from(concerns)
    .where(eq(concerns.id, concernId))
    .limit(1);

  // Zero rows means RLS refused it. Same sentence as a bad id, deliberately —
  // a distinct message here would confirm the concern exists.
  if (!row) {
    throw new HelpSlipRejectedError("That concern couldn't be found.");
  }

  // The cap applies to EVERYONE, staff included. It is a limit on how many
  // photographs one concern carries, not a restriction on a person — a
  // coordinator adding a fourth is the same clutter as an employee doing it.
  if ((await countAttachments(db, concernId)) >= MAX_ATTACHMENTS) {
    throw new HelpSlipRejectedError(
      `A concern can carry ${MAX_ATTACHMENTS} photos. Remove one first.`,
    );
  }

  // Staff may attach to anything they can read, which RLS has already decided
  // by returning the row above.
  if (isStaff(session.role)) return;

  if (row.employeeId !== session.profileId) {
    throw new HelpSlipRejectedError("That concern couldn't be found.");
  }
  if (row.status === "closed") {
    throw new HelpSlipRejectedError(
      "This concern is closed, so photos can no longer be added.",
    );
  }
}

export async function uploadToStorage(
  path: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<void> {
  const res = await storageFetch(path, {
    method: "POST",
    // Never overwrite. The path carries a fresh uuid, so a collision means
    // something is wrong and silently replacing a file is the worst answer.
    headers: { "Content-Type": mime, "x-upsert": "false" },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`storage upload ${res.status}: ${await res.text()}`);
  }
}

/** Best-effort. Used to clean up after a failed insert. */
export async function deleteFromStorage(path: string): Promise<void> {
  try {
    await storageFetch(path, { method: "DELETE" });
  } catch {
    // An orphaned object is invisible to every screen and costs a few hundred
    // kilobytes. Throwing here would turn a recoverable failure into a 500 and
    // tell the user their photo failed twice.
  }
}

/**
 * Record the upload. RLS decides whether it is allowed.
 *
 * `returning()` is what makes the refusal detectable: a policy that rejects an
 * INSERT yields zero rows rather than raising, so without this the caller
 * would report success on a write that never happened.
 */
export async function recordAttachment(
  db: HelpSlipDb,
  args: {
    concernId: string;
    filePath: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    uploadedBy: string;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(concernAttachments)
    .values({
      id: crypto.randomUUID(),
      concernId: args.concernId,
      filePath: args.filePath,
      fileName: args.fileName,
      fileSizeBytes: args.fileSizeBytes,
      mimeType: args.mimeType,
      uploadedBy: args.uploadedBy,
      createdAt: new Date(),
    })
    .returning({ id: concernAttachments.id });
  return inserted.length > 0;
}

/**
 * Remove one attachment.
 *
 * The `uploaded_by = auth.uid() OR admin` rule lives in the `attachments_delete`
 * policy and is NOT repeated here — this deletes by id and lets RLS decide.
 * Zero rows back means the policy refused, and the object is then left alone.
 */
export async function deleteAttachment(
  db: HelpSlipDb,
  attachmentId: string,
): Promise<string | null> {
  const [gone] = await db
    .delete(concernAttachments)
    .where(eq(concernAttachments.id, attachmentId))
    .returning({ filePath: concernAttachments.filePath });
  return gone?.filePath ?? null;
}

/** Used by the upload route to enforce the cap for staff as well. */
export async function countAttachments(
  db: HelpSlipDb,
  concernId: string,
): Promise<number> {
  const rows = await db
    .select({ id: concernAttachments.id })
    .from(concernAttachments)
    .where(and(eq(concernAttachments.concernId, concernId)));
  return rows.length;
}
