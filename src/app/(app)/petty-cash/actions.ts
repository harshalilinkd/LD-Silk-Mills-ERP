"use server";

import { revalidatePath } from "next/cache";

import {
  requirePettyCashCreate,
  requirePettyCashDelete,
  requirePettyCashEdit,
  requirePettyCashMasters,
} from "@/lib/petty-cash/authz";
import {
  signReceiptUpload,
  statAttachment,
  verifySignedPath,
  type SignedUpload,
} from "@/lib/petty-cash/attachments";
import { ATTACHMENT_MAX_FILES } from "@/lib/petty-cash/money";
import {
  getEntryAttachment,
  getLegacyAttachment,
} from "@/lib/petty-cash/queries";
import {
  clearMemberRole,
  removeFromPettyCash,
  createCategory,
  createEmployee,
  createTransaction,
  deleteTransaction,
  renameEmployee,
  setCategoryActive,
  setEmployeeActive,
  setMemberRole,
  updateCategory,
  updateTransaction,
  type PendingAttachment,
  type TransactionInput,
} from "@/lib/petty-cash/mutations";
import type { MemberRole } from "@/db/petty-cash/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Petty Cash — the doors in
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every one of these is: **authorise → validate → write → audit → revalidate**,
 * in that order, with the authorisation FIRST and before any argument is read.
 * A server action is a POST endpoint; it does not care which page the caller
 * was looking at, and hiding a button hides nothing.
 *
 * They are deliberately thin. The database work lives in
 * `lib/petty-cash/mutations.ts` because an entry and its audit row have to
 * share one transaction, which a `"use server"` module cannot arrange across
 * helpers.
 *
 * ── FORMDATA, BECAUSE OF THE FILE ────────────────────────────────────────
 *
 * Create and update take `FormData` rather than a typed object: a receipt is a
 * `File`, and a File cannot cross a server-action boundary inside a plain
 * object. Everything is re-read and re-validated server-side regardless, so
 * the looser wire format costs nothing.
 */

function paths() {
  revalidatePath("/petty-cash");
  revalidatePath("/petty-cash/summary");
  revalidatePath("/petty-cash/analysis");
  revalidatePath("/petty-cash/masters");
}

/** `YYYY-MM` from the transaction date, for foldering the receipt. */
function monthKeyOf(date: string): string {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "unknown";
}

function readInput(fd: FormData): TransactionInput {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    transactionDate: str("transactionDate"),
    transactionType: str("transactionType"),
    fromName: str("fromName") || null,
    // `Number` on a browser string, then validated as an integer in
    // `mutations.ts` and looked up as a row. An id is never trusted as a fact.
    employeeId: Number(str("employeeId")),
    categoryId: Number(str("categoryId")),
    reason: str("reason"),
    amount: str("amount"),
    proofType: str("proofType"),
    proofOther: str("proofOther") || null,
  };
}

/**
 * One entry on the wire: a freshly-uploaded file, one already attached to
 * this entry being kept as-is, or the single OLD-shape receipt an entry saved
 * before this table existed still carries on `transactions` itself.
 */
type PendingUpload =
  | { kind: "new"; path: string; sig: string; name: string }
  | { kind: "existing"; id: number }
  | { kind: "legacy" };

/**
 * The FULL set of receipts an entry should end up with — up to
 * `ATTACHMENT_MAX_FILES` — resolved from what the dialog sent.
 *
 * This is a whole-set replacement, not a diff: the dialog always submits
 * every file it wants kept, new and previously-existing alike, so there is
 * never a question of what changed versus what stayed.
 *
 * New files: the bytes never come through here — see the header of
 * `lib/petty-cash/attachments.ts` for why. What arrives is a path, the HMAC
 * this server put on it, and the display name. Both are re-checked: an
 * unsigned path is refused outright, and a signed one still has to exist in
 * the bucket before it is allowed to be claimed. Size and content type are
 * read back from storage rather than trusted from the browser.
 *
 * Existing/legacy files: re-fetched and re-checked to belong to THIS entry
 * rather than trusted from the form — an id on a `<select>` proves nothing
 * about which entry it was shown for.
 */
async function receiptsOf(
  fd: FormData,
  existingTransactionId: number | null,
): Promise<PendingAttachment[]> {
  const raw = fd.get("attachments");
  if (typeof raw !== "string" || !raw) return [];

  let pending: PendingUpload[];
  try {
    pending = JSON.parse(raw);
  } catch {
    throw new Error(
      "Those receipts could not be read. Please attach them again.",
    );
  }
  if (!Array.isArray(pending) || pending.length === 0) return [];
  if (pending.length > ATTACHMENT_MAX_FILES) {
    throw new Error(
      `Only ${ATTACHMENT_MAX_FILES} files can be attached at once.`,
    );
  }

  const attachments: PendingAttachment[] = [];
  for (const p of pending) {
    if (!p || typeof p.kind !== "string") {
      throw new Error(
        "Those receipts could not be read. Please attach them again.",
      );
    }

    if (p.kind === "existing" || p.kind === "legacy") {
      if (existingTransactionId === null) {
        throw new Error(
          "Those receipts could not be read. Please attach them again.",
        );
      }
      if (p.kind === "legacy") {
        const legacy = await getLegacyAttachment(existingTransactionId);
        if (!legacy)
          throw new Error("That receipt could not be found anymore.");
        attachments.push({ ...legacy, size: 0, mimeType: null });
        continue;
      }
      if (typeof p.id !== "number") {
        throw new Error(
          "Those receipts could not be read. Please attach them again.",
        );
      }
      const row = await getEntryAttachment(existingTransactionId, p.id);
      if (!row) throw new Error("A receipt could not be found anymore.");
      attachments.push({
        path: row.filePath,
        name: row.fileName,
        size: row.fileSizeBytes ?? 0,
        mimeType: row.mimeType,
      });
      continue;
    }

    if (
      typeof p.path !== "string" ||
      typeof p.sig !== "string" ||
      typeof p.name !== "string"
    ) {
      throw new Error(
        "Those receipts could not be read. Please attach them again.",
      );
    }
    if (!verifySignedPath(p.path, p.sig)) {
      throw new Error(
        "A receipt could not be verified. Please attach it again.",
      );
    }
    const stat = await statAttachment(p.path);
    if (!stat) {
      throw new Error("A receipt did not finish uploading. Please try again.");
    }
    attachments.push({
      path: p.path,
      name: p.name || "receipt",
      size: stat.size,
      mimeType: stat.contentType,
    });
  }
  return attachments;
}

/**
 * Authorise ONE upload, of one file, to one path.
 *
 * Called from the form the moment somebody picks a file — once per file, so
 * up to five files means up to five calls. It is a create-level permission on
 * purpose: being able to put a file in the bucket is a write, even before any
 * entry references it.
 */
export async function startReceiptUpload(
  transactionDate: string,
  fileName: string,
  size: number,
): Promise<SignedUpload> {
  await requirePettyCashCreate();
  const res = await signReceiptUpload(
    fileName,
    size,
    monthKeyOf(transactionDate),
  );
  if (!res.ok) throw new Error(res.error);
  return res.upload;
}

export type SaveResult = { uid: string };

export async function createEntry(fd: FormData): Promise<SaveResult> {
  const viewer = await requirePettyCashCreate();
  const input = readInput(fd);

  // Every file reached storage BEFORE this ran, so a failed upload never
  // leaves an entry claiming a receipt that does not exist. The reverse — an
  // orphaned object if the insert then fails — costs kilobytes and no
  // correctness.
  const attachments = await receiptsOf(fd, null);

  const res = await createTransaction(viewer, input, attachments);
  paths();
  return { uid: res.uid };
}

export async function updateEntry(id: number, fd: FormData): Promise<void> {
  const viewer = await requirePettyCashEdit();
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("That entry could not be found.");

  const input = readInput(fd);
  // The dialog sends the FULL set it wants kept — new uploads and previously
  // existing files alike — so this always replaces what is there rather than
  // diffing against it.
  const attachments = await receiptsOf(fd, id);

  await updateTransaction(viewer, id, input, attachments);
  paths();
}

export async function deleteEntry(
  id: number,
  note: string | null,
): Promise<{ uid: string }> {
  const viewer = await requirePettyCashDelete();
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("That entry could not be found.");
  const res = await deleteTransaction(viewer, id, note?.trim() || null);
  paths();
  return res;
}

// ─── masters ──────────────────────────────────────────────────────────────

/**
 * Add a payee, usually from the `+` beside "To" on the entry form.
 *
 * Returns the id so the form can select the new person immediately — the
 * workflow the old app has, and the reason somebody paying a rickshaw driver
 * does not have to abandon a half-filled form.
 *
 * NOTE this needs `manage_masters`, i.e. ADMIN. An operator who cannot add a
 * payee mid-entry is a real friction; if the owner wants operators to be able
 * to, this one guard changes to `requirePettyCashCreate` and nothing else does.
 */
export async function addEmployee(
  name: string,
  code: string | null,
): Promise<{ id: number; name: string; revived: boolean }> {
  const viewer = await requirePettyCashMasters();
  const res = await createEmployee(viewer, name, code);
  paths();
  return res;
}

export async function setEmployeeEnabled(
  id: number,
  active: boolean,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("That person could not be found.");
  await setEmployeeActive(viewer, id, active);
  paths();
}

export async function addCategory(
  name: string,
  groupName: string,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  await createCategory(viewer, name, groupName);
  paths();
}

export async function renamePayee(
  id: number,
  name: string,
  code: string | null,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("That person could not be found.");
  await renameEmployee(viewer, id, name, code);
  paths();
}

export async function editCategory(
  id: number,
  name: string,
  groupName: string,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("That category could not be found.");
  await updateCategory(viewer, id, name, groupName);
  paths();
}

export async function setCategoryEnabled(
  id: number,
  active: boolean,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("That category could not be found.");
  await setCategoryActive(viewer, id, active);
  paths();
}

// ─── who may do what ──────────────────────────────────────────────────────

/**
 * Grant or change a Petty Cash role.
 *
 * The role string arrives from a dropdown and is re-checked against the enum
 * inside the mutation — a `<select>` proves nothing about what was POSTed.
 */
export async function setPersonRole(
  userId: string,
  role: string,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!userId) throw new Error("That person could not be found.");
  await setMemberRole(viewer, userId, role as MemberRole);
  paths();
}

export async function clearPersonRole(userId: string): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!userId) throw new Error("That person could not be found.");
  await clearMemberRole(viewer, userId);
  paths();
}

/**
 * Remove somebody from Petty Cash altogether.
 *
 * Not the same as setting their role to "Not set": that leaves them reading
 * the ledger. This revokes the Settings → Access tick, which is what actually
 * decides who may open the module — see `removeFromPettyCash`.
 */
export async function removePersonFromPettyCash(userId: string): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!userId) throw new Error("That person could not be found.");
  await removeFromPettyCash(viewer, userId);
  paths();
}
