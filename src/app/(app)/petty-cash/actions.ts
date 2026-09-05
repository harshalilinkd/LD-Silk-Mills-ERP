"use server";

import { revalidatePath } from "next/cache";

import {
  requirePettyCashCreate,
  requirePettyCashDelete,
  requirePettyCashEdit,
  requirePettyCashMasters,
} from "@/lib/petty-cash/authz";
import { uploadAttachment } from "@/lib/petty-cash/attachments";
import {
  clearMemberRole,
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

function fileOf(fd: FormData): File | null {
  const f = fd.get("attachment");
  return f instanceof File && f.size > 0 ? f : null;
}

export type SaveResult = { uid: string };

export async function createEntry(fd: FormData): Promise<SaveResult> {
  const viewer = await requirePettyCashCreate();
  const input = readInput(fd);

  // The file is stored BEFORE the row, so a failed upload never leaves an
  // entry claiming a receipt that does not exist. The reverse — an orphaned
  // object if the insert then fails — costs kilobytes and no correctness.
  let attachment: { path: string; name: string } | null = null;
  const file = fileOf(fd);
  if (file) {
    const up = await uploadAttachment(file, monthKeyOf(input.transactionDate));
    if (!up.ok) throw new Error(up.error);
    attachment = { path: up.path, name: up.name };
  }

  const res = await createTransaction(viewer, input, attachment);
  paths();
  return { uid: res.uid };
}

export async function updateEntry(id: number, fd: FormData): Promise<void> {
  const viewer = await requirePettyCashEdit();
  if (!Number.isInteger(id) || id <= 0) throw new Error("That entry could not be found.");

  const input = readInput(fd);
  const file = fileOf(fd);
  const removeExisting = fd.get("removeAttachment") === "1";

  // Three cases, and they are genuinely different: a new file replaces,
  // "remove" clears, and neither leaves whatever is there alone. Collapsing
  // them would make every edit that did not touch the receipt delete it.
  let attachment: { path: string; name: string } | null | "unchanged" = "unchanged";
  if (file) {
    const up = await uploadAttachment(file, monthKeyOf(input.transactionDate));
    if (!up.ok) throw new Error(up.error);
    attachment = { path: up.path, name: up.name };
  } else if (removeExisting) {
    attachment = null;
  }

  await updateTransaction(viewer, id, input, attachment);
  paths();
}

export async function deleteEntry(id: number, note: string | null): Promise<{ uid: string }> {
  const viewer = await requirePettyCashDelete();
  if (!Number.isInteger(id) || id <= 0) throw new Error("That entry could not be found.");
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

export async function setEmployeeEnabled(id: number, active: boolean): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0) throw new Error("That person could not be found.");
  await setEmployeeActive(viewer, id, active);
  paths();
}

export async function addCategory(name: string, groupName: string): Promise<void> {
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
  if (!Number.isInteger(id) || id <= 0) throw new Error("That person could not be found.");
  await renameEmployee(viewer, id, name, code);
  paths();
}

export async function editCategory(
  id: number,
  name: string,
  groupName: string,
): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0) throw new Error("That category could not be found.");
  await updateCategory(viewer, id, name, groupName);
  paths();
}

export async function setCategoryEnabled(id: number, active: boolean): Promise<void> {
  const viewer = await requirePettyCashMasters();
  if (!Number.isInteger(id) || id <= 0) throw new Error("That category could not be found.");
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
export async function setPersonRole(userId: string, role: string): Promise<void> {
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
