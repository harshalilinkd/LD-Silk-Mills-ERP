import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { systemAccess, systems, users } from "@/db/schema";
import { pettyCashDb } from "@/db/petty-cash";
import { categories, employees, members, transactions } from "@/db/petty-cash/schema";
import type { MemberRole } from "@/db/petty-cash/schema";
import { addMonths, startOfMonth, todayIso, type IsoDate } from "@/lib/dates";
import { PETTY_CASH_SYSTEM_CODE } from "./authz";
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

export type MonthPoint = {
  /** First day of the month, e.g. `2026-09-01`. */
  month: IsoDate;
  credits: Money;
  debits: Money;
  balance: Money;
  count: number;
};

/**
 * Credits, debits, balance and entry count for each of the last `monthsBack`
 * months (the current one included), oldest first — the trend line the
 * Dashboard charts.
 *
 * ONE `GROUP BY` in Postgres for the whole window, not `monthsBack` separate
 * calls to `getTotals` — see the file header on why aggregates run in the
 * database rather than in a loop.
 *
 * A month with no activity is filled in as zero rather than left absent, so
 * the chart's X axis is continuous — a gap in a trend line reads as missing
 * data, not as "nothing happened that month".
 */
export async function getMonthlyTrend(monthsBack: number): Promise<MonthPoint[]> {
  const today = todayIso();
  const from = startOfMonth(addMonths(today, -(monthsBack - 1)));
  const monthKey = sql<string>`to_char(${transactions.transactionDate}, 'YYYY-MM-01')`;

  const rows = await pettyCashDb
    .select({
      month: monthKey,
      credits: CREDIT_SUM,
      debits: DEBIT_SUM,
      // Subtracted in SQL, not in JavaScript. `numeric` minus `numeric` is
      // exact; `Number(a) - Number(b)` on two paise-bearing strings is how a
      // month's net becomes 11499.999999999998, and it is the same reason the
      // column is not floating point in the first place.
      balance: sql<string>`${CREDIT_SUM} - ${DEBIT_SUM}`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(LIVE, gte(transactions.transactionDate, from)))
    .groupBy(monthKey);

  const byMonth = new Map(rows.map((r) => [r.month, r]));

  const out: MonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const month = startOfMonth(addMonths(today, -i));
    const r = byMonth.get(month);
    out.push({
      month,
      credits: r?.credits ?? "0",
      debits: r?.debits ?? "0",
      balance: r?.balance ?? "0",
      count: r?.count ?? 0,
    });
  }
  return out;
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

// ─── the masters screen ───────────────────────────────────────────────────

export type PayeeRow = {
  id: number;
  name: string;
  code: string | null;
  active: boolean;
  used: number;
  paid: Money;
  lastUsed: IsoDate | null;
};

/**
 * The payee list, with how much has actually gone through each one.
 *
 * The count is what makes switching somebody off a decision rather than a
 * guess: a name used 340 times is the canteen, a name used once is a typo. It
 * counts LIVE rows only, so a payee whose only entry was deleted reads as
 * unused — which is exactly when it is safe to tidy away.
 *
 * A left join, so a payee added five minutes ago and never used still appears.
 */
export async function getPayeesWithUse(): Promise<PayeeRow[]> {
  return pettyCashDb
    .select({
      id: employees.id,
      name: employees.name,
      code: employees.code,
      active: employees.active,
      used: sql<number>`count(${transactions.id})::int`,
      paid: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.transactionType} = 'DEBIT'), 0)`,
      lastUsed: sql<IsoDate | null>`max(${transactions.transactionDate})`,
    })
    .from(employees)
    .leftJoin(transactions, and(eq(transactions.employeeId, employees.id), LIVE))
    .groupBy(employees.id, employees.name, employees.code, employees.active)
    .orderBy(asc(employees.name));
}

export type CategoryRow = {
  id: number;
  name: string;
  groupName: string;
  active: boolean;
  sortOrder: number;
  used: number;
  spent: Money;
};

/**
 * The category list, same idea.
 *
 * Joined on the category ID, not the snapshot name — the snapshot is what an
 * old entry PRINTS, and it deliberately does not follow a rename. The id is
 * what says "this entry was filed here", which is the question this screen
 * asks.
 */
export async function getCategoriesWithUse(): Promise<CategoryRow[]> {
  return pettyCashDb
    .select({
      id: categories.id,
      name: categories.name,
      groupName: categories.groupName,
      active: categories.active,
      sortOrder: categories.sortOrder,
      used: sql<number>`count(${transactions.id})::int`,
      spent: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.transactionType} = 'DEBIT'), 0)`,
    })
    .from(categories)
    .leftJoin(transactions, and(eq(transactions.categoryId, categories.id), LIVE))
    .groupBy(
      categories.id,
      categories.name,
      categories.groupName,
      categories.active,
      categories.sortOrder,
    )
    .orderBy(asc(categories.groupName), asc(categories.sortOrder), asc(categories.name));
}

/** The distinct groups already in use, so the add form offers them. */
export async function getCategoryGroups(): Promise<string[]> {
  const rows = await pettyCashDb
    .selectDistinct({ g: categories.groupName })
    .from(categories)
    .orderBy(asc(categories.groupName));
  return rows.map((r) => r.g);
}

export type PettyCashPerson = {
  userId: string;
  name: string;
  email: string;
  erpAdmin: boolean;
  /** Null when they have never been given a role here. */
  role: MemberRole | null;
  memberActive: boolean;
  /** What they can actually do right now, bootstrap included. */
  effective: MemberRole;
};

/**
 * Everybody who can open Petty Cash, and what they may do inside it.
 *
 * The list comes from `system_access` — the tick box in Settings → Access —
 * because that is what decides who gets through the door. This screen only
 * decides what happens after. Somebody who has not been ticked does not appear
 * here at all, and the screen says where to go and tick them.
 *
 * `effective` repeats the bootstrap rule from `authz.ts` rather than being
 * recomputed by the screen, so what is shown is what the server would decide.
 */
export async function getPettyCashPeople(): Promise<PettyCashPerson[]> {
  const granted = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      erpRole: users.role,
    })
    .from(users)
    .innerJoin(systemAccess, eq(systemAccess.userId, users.id))
    .innerJoin(systems, eq(systems.id, systemAccess.systemId))
    .where(
      and(
        eq(users.status, "active"),
        eq(systemAccess.canView, true),
        eq(systems.systemCode, PETTY_CASH_SYSTEM_CODE),
      ),
    )
    .orderBy(asc(users.name));

  const rows = await pettyCashDb
    .select({ userId: members.userId, role: members.role, active: members.active })
    .from(members);
  const byUser = new Map(rows.map((r) => [r.userId, r]));

  return granted.map((p) => {
    const m = byUser.get(p.userId);
    const role = m?.active ? m.role : null;
    const erpAdmin = p.erpRole === "admin";
    return {
      userId: p.userId,
      name: p.name,
      email: p.email,
      erpAdmin,
      role: m ? m.role : null,
      memberActive: m?.active ?? false,
      effective: role ?? (erpAdmin ? "ADMIN" : "VIEWER"),
    };
  });
}
