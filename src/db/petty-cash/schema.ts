import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "@/db/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ld_petty_cash — money in, money out, and who has it now
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A rebuild of the Google Apps Script petty-cash app the company runs today.
 * That app is the FUNCTIONAL reference only: nothing here reads a spreadsheet,
 * and no data is imported from one until the owner asks for it separately.
 *
 * ── THIS SCHEMA IS OURS ──────────────────────────────────────────────────
 *
 * Like `ld_checklist_system`, and unlike `ld_order_entry` / `ld_help_slip` /
 * `goods_return`, nothing outside this repo reads or writes it. So it goes in
 * `drizzle.config.ts`'s `schemaFilter` and is managed with ordinary
 * migrations.
 *
 * ── ONE COMPANY, WITH ROOM FOR MORE ──────────────────────────────────────
 *
 * The old app runs three deployments — LINKD, LD-COTTON, LD-SILK — each with
 * its own spreadsheet, its own category list and a button to jump between
 * them. This ERP is LD Silk Mills, so this module is LD Silk Mills' cash box
 * and there is no company switcher.
 *
 * But the shape allows for more without a rebuild: categories already carry
 * their own rows rather than being a hard-coded list, and a nullable
 * `entity_id` can be added to `transactions`, `categories` and `employees`
 * later without touching a single ledger row. What would be expensive is
 * baking one company's category list into the code, so that is exactly what
 * is not done.
 */
export const ldPettyCash = pgSchema("ld_petty_cash");

/**
 * Debit takes money OUT of the box, credit puts it IN.
 *
 * Stored as an enum, never as free text: this is the sign of every figure in
 * the module, and a typo would not fail — it would silently drop a payment out
 * of the balance. `DEBIT`/`CREDIT` upper-case to match the spec and to make it
 * obvious in a query that this is a constrained value, not a label.
 */
export const transactionTypeEnum = ldPettyCash.enum("transaction_type", [
  "DEBIT",
  "CREDIT",
]);

/**
 * What kind of proof is attached. `NONE` is a real answer, not a null: "we did
 * not take a bill for the ₹20 auto fare" is different from "nobody has said".
 * `OTHER` carries its own label in `proof_other`, so the reporting values stay
 * a closed set while the wording stays free.
 */
export const proofTypeEnum = ldPettyCash.enum("proof_type", [
  "NONE",
  "VOUCHER",
  "BILL",
  "OTHER",
]);

/** Who may do what. See `lib/petty-cash/authz.ts` for the reasoning. */
export const memberRoleEnum = ldPettyCash.enum("member_role", [
  "VIEWER",
  "OPERATOR",
  "ADMIN",
]);

// ─── who may use the module ────────────────────────────────────────────────

/**
 * A person's standing in Petty Cash.
 *
 * `ld_erp_core.system_access` decides who may OPEN the module. This decides
 * what they may do once inside, and it is deliberately separate: seeing what
 * the cash box holds and being able to take money out of it are not the same
 * permission, and the ERP has no general capability system to hang that on —
 * every module carries its own role table (`ld_order_entry.users.role`,
 * `ld_help_slip.profiles.role`, `checklist doers.is_admin`). This follows
 * that convention rather than inventing a parallel one.
 */
export const members = ldPettyCash.table(
  "members",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRoleEnum("role").notNull().default("VIEWER"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_pc_member_user").on(t.userId)],
);

// ─── who the money goes to ─────────────────────────────────────────────────

/**
 * A payee. Almost never an ERP account.
 *
 * The old system keeps 255 of these in a sheet, and the great majority are
 * factory staff with no login anywhere. `ld_erp_core.users` is the list of
 * people who can SIGN IN — eleven rows — so it cannot represent them, and
 * `ld_checklist_system.doers` belongs to a different module answering a
 * different question. Hence a table here.
 *
 * `code` is the old `Emp - ID` (`AB-02`, `SE-19`). Optional, because a payee
 * created mid-transaction by somebody paying a rickshaw driver has no staff
 * number and should not be blocked for want of one.
 */
export const employees = ldPettyCash.table(
  "employees",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    /** The old sheet's `Emp - ID`. Optional — see above. */
    code: varchar("code", { length: 40 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [
    // Case-insensitive uniqueness on the NAME, which is what people actually
    // type. Without it "Sonali Jadhav" and "sonali jadhav" become two people
    // and every report about her is silently split in half.
    uniqueIndex("uq_pc_employee_name").on(sql`lower(${t.name})`),
    index("idx_pc_employee_active").on(t.active),
  ],
);

// ─── what the money was for ────────────────────────────────────────────────

/**
 * A spending category, and the group it rolls up to on the summary.
 *
 * ── WHY THIS IS A TABLE AND NOT A LIST IN THE CODE ───────────────────────
 *
 * The old app hard-codes a different array per company — LINKD has no Hamal,
 * LD-COTTON has Night Charges and Overtime, LD-SILK has Hamal but not those.
 * Any of those lists changing means an edit and a redeploy. Worse, its monthly
 * summary derives the reporting GROUP by matching keywords against the
 * category text, so renaming a category quietly moves money between groups on
 * a report nobody re-checks.
 *
 * Here the group is a column. A category belongs to exactly one group, chosen
 * when it is created, and renaming it cannot move it.
 */
export const categories = ldPettyCash.table(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    /** What it rolls up to on the monthly summary. */
    groupName: varchar("group_name", { length: 80 }).notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_pc_category_name").on(sql`lower(${t.name})`),
    index("idx_pc_category_active").on(t.active, t.sortOrder),
  ],
);

// ─── the ledger ────────────────────────────────────────────────────────────

/**
 * One movement of cash. This table is the financial source of truth.
 *
 * ── THE AMOUNT IS A NUMBER, AND THE SIGN IS NOT IN IT ────────────────────
 *
 * `numeric(12,2)`, always POSITIVE, with the direction carried by
 * `transactionType`. Storing signed amounts invites `SUM(amount)` to look like
 * a balance while silently including deleted rows and mixing the two
 * directions; storing "₹1,250.00" as text — which the spreadsheet does — makes
 * every total a string-parsing exercise. The check constraint enforces `> 0`
 * at the database, not just in the form.
 *
 * `numeric`, not `double precision`: money in binary floating point does not
 * add up, and a petty-cash box that is eleven paise out every month is a box
 * nobody trusts.
 *
 * ── THE DATE IS A DATE ───────────────────────────────────────────────────
 *
 * `transactionDate` is a calendar day — "this was spent on the 18th" — and is
 * a `date`, not a timestamp. The old app derives its calendar from a
 * timestamp, which is how a payment entered at 1am lands on the previous day.
 * `createdAt` is a real instant, because that is a different fact.
 *
 * ── SOFT DELETE, BECAUSE THIS IS MONEY ───────────────────────────────────
 *
 * The old app deletes the spreadsheet row. Here a deletion sets `deletedAt`
 * and `deletedBy`: the row leaves every view and every total, and remains for
 * audit. Financial history is not ours to destroy on a single click.
 */
export const transactions = ldPettyCash.table(
  "transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /**
     * The human-readable reference, `PC-2026-000123`. Generated from a
     * database sequence inside the inserting statement, never from
     * `max(id)+1` — two people saving at the same moment must not be able to
     * receive the same number.
     */
    uid: varchar("uid", { length: 24 }).notNull(),

    transactionDate: date("transaction_date").notNull(),
    transactionType: transactionTypeEnum("transaction_type").notNull(),

    /**
     * Who handed the money over. Free text with a self-populating dropdown
     * rather than a master table: the old system's values are a mix of the
     * company itself and individuals ("Linkd", "NAUSHI T.", "HR"), there are
     * fewer than a dozen, and the person who paid may have left. Same shape as
     * the Checklist's "Assigned by", which the owner has already accepted.
     */
    fromName: varchar("from_name", { length: 160 }),

    /** The payee. A real row, because these are reported on by person. */
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    /**
     * The payee's name AS IT WAS. Snapshotted for the same reason Goods Return
     * snapshots its quality names: a payee renamed in 2027 must not silently
     * rewrite what a voucher said in 2026.
     */
    toName: varchar("to_name", { length: 160 }).notNull(),

    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    /** Snapshot, for the same reason as `toName`. */
    categoryName: varchar("category_name", { length: 80 }).notNull(),

    reason: text("reason").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

    proofType: proofTypeEnum("proof_type").notNull().default("NONE"),
    /** Only when `proofType` is OTHER. */
    proofOther: varchar("proof_other", { length: 60 }),

    /**
     * A STORAGE PATH inside the private bucket, never a public URL. Files are
     * streamed back through an API route that re-checks access on every view —
     * the same decision Goods Return and Help Slip both made, because a signed
     * URL is a bearer token that survives being pasted into WhatsApp.
     */
    attachmentPath: text("attachment_path"),
    attachmentName: varchar("attachment_name", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("uq_pc_txn_uid").on(t.uid),
    // Money must be positive; the direction lives in `transaction_type`.
    check("ck_pc_amount_positive", sql`${t.amount} > 0`),
    // OTHER needs a label; nothing else may carry one.
    check(
      "ck_pc_proof_other",
      sql`(${t.proofType} = 'OTHER' and ${t.proofOther} is not null and length(btrim(${t.proofOther})) > 0)
          or (${t.proofType} <> 'OTHER' and ${t.proofOther} is null)`,
    ),
    // An attachment is a path AND a name, or neither.
    check(
      "ck_pc_attachment_pair",
      sql`(${t.attachmentPath} is null) = (${t.attachmentName} is null)`,
    ),
    // The three the ledger is read by: newest-first listing, the balance
    // aggregate, and the month/day grouping behind Summary and Analysis.
    index("idx_pc_txn_date").on(t.transactionDate, t.id),
    index("idx_pc_txn_live_date").on(t.deletedAt, t.transactionDate),
    index("idx_pc_txn_type").on(t.transactionType),
    index("idx_pc_txn_category").on(t.categoryId),
    index("idx_pc_txn_employee").on(t.employeeId),
  ],
);

// ─── relations ────────────────────────────────────────────────────────────

export const transactionsRelations = relations(transactions, ({ one }) => ({
  employee: one(employees, {
    fields: [transactions.employeeId],
    references: [employees.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const employeesRelations = relations(employees, ({ many }) => ({
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}));

// ─── inferred types ───────────────────────────────────────────────────────

export type PettyCashMember = typeof members.$inferSelect;
export type PettyCashEmployee = typeof employees.$inferSelect;
export type PettyCashCategory = typeof categories.$inferSelect;
export type PettyCashTransaction = typeof transactions.$inferSelect;
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type ProofType = (typeof proofTypeEnum.enumValues)[number];
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
