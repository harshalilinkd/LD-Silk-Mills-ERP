import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { TransactionSql } from "postgres";

import { sql as pg } from "@/db";
import { pettyCashDb } from "@/db/petty-cash";
import { categories, employees, transactions } from "@/db/petty-cash/schema";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import {
  checkAmount,
  isProofType,
  isTransactionType,
  type ProofType,
  type TransactionType,
} from "./money";
import type { PettyCashViewer } from "./authz";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything that changes the ledger
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THE ENTRY AND ITS AUDIT ROW ARE ONE TRANSACTION ──────────────────────
 *
 * A payment recorded with no audit trail, because the second insert failed, is
 * worse than no payment recorded at all: the money has moved and nothing says
 * who moved it. So both writes happen inside `BEGIN … COMMIT` and either both
 * land or neither does.
 *
 * That is also why these live here rather than in the `"use server"` file. A
 * server action cannot easily share one transaction across helpers; a plain
 * module can, and the actions become thin wrappers that authorise, call one of
 * these, and revalidate.
 *
 * ── VALIDATION IS SERVER-SIDE, FULL STOP ─────────────────────────────────
 *
 * Every field is re-checked here against the same `money.ts` rules the form
 * uses. The form's checks are a courtesy to whoever is typing; these are the
 * ones that decide. Ids arriving from the browser are looked up, never
 * trusted — a category id is meaningless until it is a row.
 *
 * ── THE ACTOR NEVER COMES FROM THE BROWSER ───────────────────────────────
 *
 * Every function takes a `PettyCashViewer` resolved from the session. Nothing
 * here accepts a `createdBy` or a `userId` as an argument.
 */

const AUDIT_MODULE = "petty-cash";

export type TransactionInput = {
  transactionDate: string;
  transactionType: string;
  fromName: string | null;
  employeeId: number;
  categoryId: number;
  reason: string;
  amount: string;
  proofType: string;
  proofOther: string | null;
};

type Clean = {
  transactionDate: IsoDate;
  transactionType: TransactionType;
  fromName: string | null;
  employeeId: number;
  categoryId: number;
  reason: string;
  amount: string;
  proofType: ProofType;
  proofOther: string | null;
};

/** Every rule, in one place, so create and update cannot diverge. */
function validate(input: TransactionInput): Clean {
  if (!isIsoDate(input.transactionDate)) {
    throw new Error("Pick a valid date.");
  }
  if (!isTransactionType(input.transactionType)) {
    throw new Error("Choose whether this is money in or money out.");
  }
  const amount = checkAmount(input.amount);
  if (!amount.ok) throw new Error(amount.error);

  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("Say what the money was for.");
  if (reason.length > 2000) throw new Error("That description is too long.");

  if (!Number.isInteger(input.employeeId) || input.employeeId <= 0) {
    throw new Error("Choose who the money went to.");
  }
  if (!Number.isInteger(input.categoryId) || input.categoryId <= 0) {
    throw new Error("Choose a category.");
  }
  if (!isProofType(input.proofType)) throw new Error("Choose a proof type.");

  const other = input.proofOther?.trim() || null;
  if (input.proofType === "OTHER" && !other) {
    throw new Error("Say what kind of proof it is.");
  }

  return {
    transactionDate: input.transactionDate,
    transactionType: input.transactionType,
    fromName: input.fromName?.trim() || null,
    employeeId: input.employeeId,
    categoryId: input.categoryId,
    reason,
    amount: amount.value,
    // The check constraint refuses a label on anything but OTHER, so it is
    // cleared here rather than left to fail at the database.
    proofType: input.proofType,
    proofOther: input.proofType === "OTHER" ? other : null,
  };
}

/** Resolve the two ids to rows, and take their names for the snapshot. */
async function resolveRefs(
  tx: typeof pettyCashDb,
  employeeId: number,
  categoryId: number,
): Promise<{ toName: string; categoryName: string }> {
  const [emp] = await tx
    .select({ name: employees.name })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.active, true)))
    .limit(1);
  if (!emp) throw new Error("That person is not on the payee list.");

  const [cat] = await tx
    .select({ name: categories.name })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.active, true)))
    .limit(1);
  if (!cat) throw new Error("That category is not available.");

  return { toName: emp.name, categoryName: cat.name };
}

/**
 * Write one audit row.
 *
 * `ld_erp_core.audit_logs` already exists and is what Goods Return uses; this
 * does not invent a second audit system. Raw SQL because the row is being
 * written on the SAME connection as the ledger insert, inside one transaction,
 * and that connection is a `postgres.js` handle rather than a Drizzle instance.
 */
async function audit(
  tx: TransactionSql,
  actor: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx`
    insert into ld_erp_core.audit_logs (user_id, action, system_code, metadata)
    values (${actor}::uuid, ${action}, ${AUDIT_MODULE}, ${JSON.stringify(metadata)}::jsonb)`;
}

export type CreateResult = { id: number; uid: string };

/**
 * Record one movement of cash.
 *
 * The reference number is built inside the INSERT from a dedicated sequence,
 * so two people saving in the same second cannot receive the same one. The
 * year comes from Asia/Kolkata, not the server's clock, for the same reason
 * every other date in this ERP does.
 */
export async function createTransaction(
  viewer: PettyCashViewer,
  input: TransactionInput,
  attachment: { path: string; name: string } | null,
): Promise<CreateResult> {
  const v = validate(input);
  const { toName, categoryName } = await resolveRefs(pettyCashDb, v.employeeId, v.categoryId);

  return pg.begin(async (tx) => {
    const [row] = await tx<{ id: number; uid: string }[]>`
      insert into ld_petty_cash.transactions
        (uid, transaction_date, transaction_type, from_name, employee_id, to_name,
         category_id, category_name, reason, amount, proof_type, proof_other,
         attachment_path, attachment_name, created_by, updated_by)
      values (
        'PC-' || to_char((now() at time zone 'Asia/Kolkata'), 'YYYY') || '-' ||
          lpad(nextval('ld_petty_cash.transaction_uid_seq')::text, 6, '0'),
        ${v.transactionDate}::date, ${v.transactionType}::ld_petty_cash.transaction_type,
        ${v.fromName}, ${v.employeeId}, ${toName},
        ${v.categoryId}, ${categoryName}, ${v.reason}, ${v.amount}::numeric,
        ${v.proofType}::ld_petty_cash.proof_type, ${v.proofOther},
        ${attachment?.path ?? null}, ${attachment?.name ?? null},
        ${viewer.userId}::uuid, ${viewer.userId}::uuid
      )
      returning id, uid`;

    await audit(tx, viewer.userId, "petty-cash.created", {
      id: row.id,
      uid: row.uid,
      type: v.transactionType,
      amount: v.amount,
      date: v.transactionDate,
      category: categoryName,
      to: toName,
    });

    return { id: row.id, uid: row.uid };
  });
}

/**
 * Change one.
 *
 * `uid`, `created_at` and `created_by` are never touched — the reference a
 * person quoted last month must still find the same entry, and who first
 * recorded it is a fact about the past. The audit row carries BEFORE and
 * AFTER, so a figure that changed can be traced without keeping a second
 * copy of the table.
 */
export async function updateTransaction(
  viewer: PettyCashViewer,
  id: number,
  input: TransactionInput,
  attachment: { path: string; name: string } | null | "unchanged",
): Promise<void> {
  const v = validate(input);
  const { toName, categoryName } = await resolveRefs(pettyCashDb, v.employeeId, v.categoryId);

  const [before] = await pettyCashDb
    .select({
      uid: transactions.uid,
      transactionDate: transactions.transactionDate,
      transactionType: transactions.transactionType,
      amount: transactions.amount,
      categoryName: transactions.categoryName,
      toName: transactions.toName,
      reason: transactions.reason,
      attachmentPath: transactions.attachmentPath,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .limit(1);
  if (!before) throw new Error("That entry no longer exists.");

  await pg.begin(async (tx) => {
    if (attachment === "unchanged") {
      await tx`
        update ld_petty_cash.transactions set
          transaction_date = ${v.transactionDate}::date,
          transaction_type = ${v.transactionType}::ld_petty_cash.transaction_type,
          from_name = ${v.fromName}, employee_id = ${v.employeeId}, to_name = ${toName},
          category_id = ${v.categoryId}, category_name = ${categoryName},
          reason = ${v.reason}, amount = ${v.amount}::numeric,
          proof_type = ${v.proofType}::ld_petty_cash.proof_type, proof_other = ${v.proofOther},
          updated_at = now(), updated_by = ${viewer.userId}::uuid
        where id = ${id} and deleted_at is null`;
    } else {
      await tx`
        update ld_petty_cash.transactions set
          transaction_date = ${v.transactionDate}::date,
          transaction_type = ${v.transactionType}::ld_petty_cash.transaction_type,
          from_name = ${v.fromName}, employee_id = ${v.employeeId}, to_name = ${toName},
          category_id = ${v.categoryId}, category_name = ${categoryName},
          reason = ${v.reason}, amount = ${v.amount}::numeric,
          proof_type = ${v.proofType}::ld_petty_cash.proof_type, proof_other = ${v.proofOther},
          attachment_path = ${attachment?.path ?? null},
          attachment_name = ${attachment?.name ?? null},
          updated_at = now(), updated_by = ${viewer.userId}::uuid
        where id = ${id} and deleted_at is null`;
    }

    await audit(tx, viewer.userId, "petty-cash.updated", {
      id,
      uid: before.uid,
      before: {
        date: before.transactionDate,
        type: before.transactionType,
        amount: before.amount,
        category: before.categoryName,
        to: before.toName,
        reason: before.reason,
      },
      after: {
        date: v.transactionDate,
        type: v.transactionType,
        amount: v.amount,
        category: categoryName,
        to: toName,
        reason: v.reason,
      },
      attachmentChanged: attachment !== "unchanged",
    });
  });

  // Only after the row is committed pointing elsewhere. The row is the record
  // of truth; an orphaned object costs kilobytes, a dangling path is a broken
  // link on a screen.
  if (attachment !== "unchanged" && before.attachmentPath && before.attachmentPath !== attachment?.path) {
    const { deleteAttachment } = await import("./attachments");
    await deleteAttachment(before.attachmentPath);
  }
}

/**
 * Remove one from every view, without destroying it.
 *
 * The old app deletes the spreadsheet row. This sets `deleted_at`/`deleted_by`:
 * the entry leaves the ledger, the balance and every total, and remains for
 * audit. The attachment is deliberately KEPT — the receipt is the evidence for
 * a payment somebody may later have to justify having removed.
 */
export async function deleteTransaction(
  viewer: PettyCashViewer,
  id: number,
  note: string | null,
): Promise<{ uid: string }> {
  const [before] = await pettyCashDb
    .select({
      uid: transactions.uid,
      amount: transactions.amount,
      transactionType: transactions.transactionType,
      transactionDate: transactions.transactionDate,
      categoryName: transactions.categoryName,
      toName: transactions.toName,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .limit(1);
  if (!before) throw new Error("That entry has already been removed.");

  await pg.begin(async (tx) => {
    // `deleted_at is null` in the statement, not checked beforehand: between
    // the read above and this write somebody else may have removed it.
    const rows = await tx`
      update ld_petty_cash.transactions
         set deleted_at = now(), deleted_by = ${viewer.userId}::uuid, updated_at = now()
       where id = ${id} and deleted_at is null
       returning id`;
    if (rows.length === 0) throw new Error("That entry has already been removed.");

    await audit(tx, viewer.userId, "petty-cash.deleted", {
      id,
      uid: before.uid,
      type: before.transactionType,
      amount: before.amount,
      date: before.transactionDate,
      category: before.categoryName,
      to: before.toName,
      note,
    });
  });

  return { uid: before.uid };
}

// ─── the masters ──────────────────────────────────────────────────────────

/**
 * Add a payee, usually from inside the entry form.
 *
 * The unique index is on `lower(name)`, so the duplicate check is the
 * database's and not a `SELECT` that races. A name that already exists but is
 * INACTIVE is revived rather than refused — otherwise somebody is told the
 * name is taken by a person they cannot see.
 */
export async function createEmployee(
  viewer: PettyCashViewer,
  name: string,
  code: string | null,
): Promise<{ id: number; name: string; revived: boolean }> {
  const clean = name.trim();
  if (!clean) throw new Error("Enter a name.");
  if (clean.length > 160) throw new Error("That name is too long.");

  const [existing] = await pettyCashDb
    .select({ id: employees.id, name: employees.name, active: employees.active })
    .from(employees)
    .where(sql`lower(${employees.name}) = lower(${clean})`)
    .limit(1);

  if (existing?.active) {
    throw new Error(`${existing.name} is already on the list.`);
  }
  if (existing) {
    await pettyCashDb
      .update(employees)
      .set({ name: clean, code: code?.trim() || null, active: true, updatedAt: new Date() })
      .where(eq(employees.id, existing.id));
    return { id: existing.id, name: clean, revived: true };
  }

  const [row] = await pettyCashDb
    .insert(employees)
    .values({ name: clean, code: code?.trim() || null, createdBy: viewer.userId })
    .returning({ id: employees.id });

  return { id: row.id, name: clean, revived: false };
}

export async function setEmployeeActive(
  _viewer: PettyCashViewer,
  id: number,
  active: boolean,
): Promise<void> {
  await pettyCashDb
    .update(employees)
    .set({ active, updatedAt: new Date() })
    .where(eq(employees.id, id));
}

export async function createCategory(
  _viewer: PettyCashViewer,
  name: string,
  groupName: string,
): Promise<{ id: number }> {
  const n = name.trim();
  const g = groupName.trim();
  if (!n) throw new Error("Enter a category name.");
  if (!g) throw new Error("Choose which group it rolls up to.");

  const [existing] = await pettyCashDb
    .select({ id: categories.id, active: categories.active })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${n})`)
    .limit(1);

  if (existing?.active) throw new Error("That category already exists.");
  if (existing) {
    await pettyCashDb
      .update(categories)
      .set({ name: n, groupName: g, active: true })
      .where(eq(categories.id, existing.id));
    return { id: existing.id };
  }

  const [row] = await pettyCashDb
    .insert(categories)
    .values({ name: n, groupName: g })
    .returning({ id: categories.id });
  return { id: row.id };
}
