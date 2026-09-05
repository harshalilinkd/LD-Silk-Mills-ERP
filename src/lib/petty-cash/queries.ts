import "server-only";

import { and, asc, desc, eq, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";

import { pettyCashDb } from "@/db/petty-cash";
import { categories, employees, transactions } from "@/db/petty-cash/schema";
import type { IsoDate } from "@/lib/dates";
import type { Money, ProofType, TransactionType } from "./money";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Every figure in Petty Cash comes from here
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ONE DEFINITION OF "LIVE", ONE OF "BALANCE" ───────────────────────────
 *
 * The dashboard, the monthly summary and the calendar all answer questions
 * about the same money, and the fastest way to lose a company's trust is for
 * them to disagree by ₹200 because one of them forgot to exclude deleted rows.
 *
 * So `LIVE` is written once and used by all of them, and the credit/debit
 * split is written once as `CREDIT_SUM`/`DEBIT_SUM`. Balance is always
 * `credits − debits`, never the reverse, and never re-derived at a call site.
 *
 * ── AGGREGATES RUN IN POSTGRES ───────────────────────────────────────────
 *
 * The old app reads the entire sheet into the browser and reverses it. At 1,589
 * rows that is survivable; as a habit it is not. Every total here is a `SUM`
 * the database performs, and the ledger is paged.
 *
 * ── SEQUENTIAL, ALWAYS ───────────────────────────────────────────────────
 *
 * The pool holds five connections and pipelined statements stall under the
 * transaction pooler. Four concurrent is the documented ceiling; awaiting them
 * in turn is simpler than counting.
 */

/** Not deleted. The single definition — see the header. */
const LIVE = isNull(transactions.deletedAt);

const CREDIT_SUM = sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.transactionType} = 'CREDIT'), 0)`;
const DEBIT_SUM = sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.transactionType} = 'DEBIT'), 0)`;

export type LedgerFilters = {
  search?: string | null;
  type?: TransactionType | null;
  categoryId?: number | null;
  employeeId?: number | null;
  proofType?: ProofType | null;
  from?: IsoDate | null;
  to?: IsoDate | null;
  /** A single day, which is what the Analysis calendar links to. */
  on?: IsoDate | null;
};

function conditions(f: LedgerFilters): SQL[] {
  const where: SQL[] = [LIVE];

  if (f.on) {
    where.push(eq(transactions.transactionDate, f.on));
  } else {
    if (f.from) where.push(gte(transactions.transactionDate, f.from));
    if (f.to) where.push(lte(transactions.transactionDate, f.to));
  }
  if (f.type) where.push(eq(transactions.transactionType, f.type));
  if (f.categoryId) where.push(eq(transactions.categoryId, f.categoryId));
  if (f.employeeId) where.push(eq(transactions.employeeId, f.employeeId));
  if (f.proofType) where.push(eq(transactions.proofType, f.proofType));

  const q = f.search?.trim();
  if (q) {
    // Server-side, across the fields somebody actually remembers. A leading
    // wildcard cannot use an index, which is the right trade here: the words
    // people recall are rarely the first ones in a reason.
    const needle = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(
      or(
        sql`${transactions.uid} ilike ${needle}`,
        sql`${transactions.reason} ilike ${needle}`,
        sql`${transactions.toName} ilike ${needle}`,
        sql`coalesce(${transactions.fromName}, '') ilike ${needle}`,
        sql`${transactions.categoryName} ilike ${needle}`,
        // Amount, only when the search looks like one. Casting every row's
        // numeric to text on a text search would be a scan for nothing.
        /^[\d.]+$/.test(q) ? sql`${transactions.amount}::text like ${q + "%"}` : sql`false`,
      )!,
    );
  }
  return where;
}

export type LedgerRow = {
  id: number;
  uid: string;
  transactionDate: IsoDate;
  transactionType: TransactionType;
  fromName: string | null;
  toName: string;
  categoryName: string;
  reason: string;
  amount: Money;
  proofType: ProofType;
  proofOther: string | null;
  hasAttachment: boolean;
  attachmentName: string | null;
};

export type LedgerSort = "date" | "amount" | "category";

export type LedgerPage = {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** One page of the ledger. Newest first unless asked otherwise. */
export async function getTransactions(
  f: LedgerFilters,
  opts: { page?: number; pageSize?: number; sort?: LedgerSort; dir?: "asc" | "desc" } = {},
): Promise<LedgerPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(opts.pageSize ?? 0)
    ? opts.pageSize!
    : DEFAULT_PAGE_SIZE;
  const dir = opts.dir ?? "desc";
  const d = dir === "asc" ? asc : desc;

  const order =
    opts.sort === "amount"
      ? [d(transactions.amount), desc(transactions.id)]
      : opts.sort === "category"
        ? [d(transactions.categoryName), desc(transactions.id)]
        // `id` breaks every tie, so paging cannot repeat or skip a row when
        // several entries share a date.
        : [d(transactions.transactionDate), desc(transactions.id)];

  const where = and(...conditions(f));

  const rows = await pettyCashDb
    .select({
      id: transactions.id,
      uid: transactions.uid,
      transactionDate: transactions.transactionDate,
      transactionType: transactions.transactionType,
      fromName: transactions.fromName,
      toName: transactions.toName,
      categoryName: transactions.categoryName,
      reason: transactions.reason,
      amount: transactions.amount,
      proofType: transactions.proofType,
      proofOther: transactions.proofOther,
      hasAttachment: sql<boolean>`${transactions.attachmentPath} is not null`,
      attachmentName: transactions.attachmentName,
    })
    .from(transactions)
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [count] = await pettyCashDb
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(where);

  return { rows: rows as LedgerRow[], total: count?.n ?? 0, page, pageSize };
}

export type Totals = {
  credits: Money;
  debits: Money;
  balance: Money;
  count: number;
};

/**
 * The headline figures, for whatever is currently filtered.
 *
 * `balance = credits − debits`. Computed in SQL so it cannot drift from the
 * two numbers printed beside it.
 */
export async function getTotals(f: LedgerFilters = {}): Promise<Totals> {
  const [row] = await pettyCashDb
    .select({
      credits: CREDIT_SUM,
      debits: DEBIT_SUM,
      balance: sql<string>`${CREDIT_SUM} - ${DEBIT_SUM}`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(...conditions(f)));

  return row ?? { credits: "0", debits: "0", balance: "0", count: 0 };
}

/**
 * The balance of the WHOLE box, ignoring every filter.
 *
 * Deliberately separate from `getTotals`: "what is in the box" and "what did
 * September cost" are different questions, and showing a filtered balance
 * under the words "Current Balance" is how somebody concludes the cash has
 * gone missing.
 */
export async function getCurrentBalance(): Promise<Totals> {
  return getTotals({});
}

// ─── the monthly summary ──────────────────────────────────────────────────

export type MonthSummary = {
  from: IsoDate;
  to: IsoDate;
  totals: Totals;
  byGroup: { groupName: string; credits: Money; debits: Money; count: number }[];
  byCategory: { categoryName: string; groupName: string; debits: Money; count: number }[];
};

/**
 * One month, totalled and broken down.
 *
 * The breakdown joins `categories` for the GROUP rather than matching keywords
 * against the category name, which is what the old app does — and why renaming
 * a category there silently moves money between groups on a report nobody
 * re-checks.
 *
 * It groups by the SNAPSHOT name so a category renamed later does not rewrite
 * what last March's report said, while taking the group from the live row so
 * regrouping is deliberate and immediate.
 */
export async function getMonthlySummary(
  from: IsoDate,
  to: IsoDate,
): Promise<MonthSummary> {
  const range = and(LIVE, gte(transactions.transactionDate, from), lte(transactions.transactionDate, to));

  const totals = await getTotals({ from, to });

  const byGroup = await pettyCashDb
    .select({
      groupName: categories.groupName,
      credits: CREDIT_SUM,
      debits: DEBIT_SUM,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(range)
    .groupBy(categories.groupName)
    .orderBy(desc(DEBIT_SUM));

  const byCategory = await pettyCashDb
    .select({
      categoryName: transactions.categoryName,
      groupName: categories.groupName,
      debits: DEBIT_SUM,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(range)
    .groupBy(transactions.categoryName, categories.groupName)
    .orderBy(desc(DEBIT_SUM));

  return { from, to, totals, byGroup, byCategory };
}

// ─── the analysis calendar ────────────────────────────────────────────────

export type DayTotals = { date: IsoDate; credits: Money; debits: Money; count: number };

/**
 * One row per day that had activity, for the calendar.
 *
 * Grouped by `transaction_date` — the calendar day somebody wrote down — and
 * never by `created_at`. The old app derives its calendar from the timestamp,
 * which is how an entry made at 1am appears on the previous day.
 *
 * Days with nothing are simply absent; the calendar fills the gaps, which is
 * cheaper than making Postgres generate a series to return zeroes.
 */
export async function getDailyTotals(
  from: IsoDate,
  to: IsoDate,
): Promise<DayTotals[]> {
  const rows = await pettyCashDb
    .select({
      date: transactions.transactionDate,
      credits: CREDIT_SUM,
      debits: DEBIT_SUM,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(LIVE, gte(transactions.transactionDate, from), lte(transactions.transactionDate, to)),
    )
    .groupBy(transactions.transactionDate)
    .orderBy(asc(transactions.transactionDate));

  return rows as DayTotals[];
}

/** The years that actually have entries, so the pickers offer no empty ones. */
export async function getActiveYears(): Promise<number[]> {
  const rows = await pettyCashDb
    .select({ y: sql<number>`extract(year from ${transactions.transactionDate})::int` })
    .from(transactions)
    .where(LIVE)
    .groupBy(sql`extract(year from ${transactions.transactionDate})`)
    .orderBy(desc(sql`extract(year from ${transactions.transactionDate})`));
  return rows.map((r) => r.y);
}

// ─── one entry, in full ───────────────────────────────────────────────────

export type TransactionDetail = LedgerRow & {
  employeeId: number;
  categoryId: number;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  updatedByName: string | null;
};

export async function getTransaction(id: number): Promise<TransactionDetail | null> {
  const [row] = await pettyCashDb
    .select({
      id: transactions.id,
      uid: transactions.uid,
      transactionDate: transactions.transactionDate,
      transactionType: transactions.transactionType,
      fromName: transactions.fromName,
      toName: transactions.toName,
      employeeId: transactions.employeeId,
      categoryId: transactions.categoryId,
      categoryName: transactions.categoryName,
      reason: transactions.reason,
      amount: transactions.amount,
      proofType: transactions.proofType,
      proofOther: transactions.proofOther,
      hasAttachment: sql<boolean>`${transactions.attachmentPath} is not null`,
      attachmentName: transactions.attachmentName,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      createdBy: transactions.createdBy,
      updatedBy: transactions.updatedBy,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), LIVE))
    .limit(1);

  if (!row) return null;

  // Who did it, resolved from the ERP's own people list. A second query rather
  // than a cross-schema join, because `ld_erp_core` is a different Drizzle
  // instance and eleven rows is nothing.
  const names = await resolveActorNames([row.createdBy, row.updatedBy]);

  return {
    ...(row as unknown as LedgerRow),
    employeeId: row.employeeId,
    categoryId: row.categoryId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    updatedByName: row.updatedBy ? (names.get(row.updatedBy) ?? null) : null,
  };
}

async function resolveActorNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (wanted.length === 0) return new Map();
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ─── the masters the form offers ──────────────────────────────────────────

export async function getEmployees(includeInactive = false) {
  return pettyCashDb
    .select({
      id: employees.id,
      name: employees.name,
      code: employees.code,
      active: employees.active,
    })
    .from(employees)
    .where(includeInactive ? undefined : eq(employees.active, true))
    .orderBy(asc(employees.name));
}

export async function getCategories(includeInactive = false) {
  return pettyCashDb
    .select({
      id: categories.id,
      name: categories.name,
      groupName: categories.groupName,
      active: categories.active,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(includeInactive ? undefined : eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/**
 * The "From" values already in use, for the dropdown.
 *
 * Self-populating rather than a master table — see the note on
 * `transactions.fromName`. Distinct over live rows only, so a value that only
 * ever appeared on a deleted entry does not haunt the list.
 */
export async function getFromOptions(): Promise<string[]> {
  const rows = await pettyCashDb
    .selectDistinct({ v: transactions.fromName })
    .from(transactions)
    .where(and(LIVE, sql`${transactions.fromName} is not null`))
    .orderBy(asc(transactions.fromName));
  return rows.map((r) => r.v).filter((v): v is string => !!v);
}
