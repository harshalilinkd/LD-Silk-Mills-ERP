// Ported from the standalone Goods Return app's lib/returns-query.ts
// (github.com/mendoza0123/goods-return-system). The filter semantics, the SQL
// and the ordering are unchanged — same live tables, same 341 rows, and the
// standalone app is still running against them, so a "small improvement" here
// is a divergence between two apps reading one database.
//
// ⚠️ Concurrency: `goodsReturnDb` rides the ONE shared postgres.js pool, capped
// at max:5 for the whole process (src/db/index.ts). Past that, postgres.js
// pipelines the surplus onto a busy connection, and pipelined statements stall
// under Supavisor transaction pooling — the request hangs rather than erroring.
// getReturnsList fires exactly TWO statements at once (rows + count); every
// other function here is strictly sequential. Do not raise either number, and
// do not wrap several of these in a Promise.all at the call site.
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { goodsReturnDb as db } from "@/db/goods-return";
import {
  brokers,
  parties,
  qualities,
  returnItems,
  returns,
  transports,
  users,
  type ReturnStatus,
} from "@/db/goods-return/schema";

// Re-exported from the schema rather than re-declared as a string union, which
// is what the original file did. Two hand-written copies of the enum drift the
// day the database gains a third status, and only one of them is checked
// against the live type.
export type { ReturnStatus };

export type ReturnsFilter = {
  /** Matched against displayId, billNo, trackingNo, party name and broker name. */
  search?: string;
  status?: ReturnStatus;
  partyId?: number;
  reason?: string;
  /** `dated`, inclusive at both ends, as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * The one place the filter becomes SQL, shared by the list, its count and the
 * export — so a CSV can never contain a row the screen was hiding.
 *
 * Because the search reaches across to `parties.name` and `brokers.name`, every
 * query using this WHERE must carry the same two left joins, including the
 * count, which looks like it does not need them.
 */
function buildWhere(f: ReturnsFilter): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.search) {
    const q = `%${f.search}%`;
    conds.push(
      or(
        ilike(returns.displayId, q),
        ilike(returns.billNo, q),
        ilike(returns.trackingNo, q),
        ilike(parties.name, q),
        ilike(brokers.name, q),
      ),
    );
  }
  if (f.status) conds.push(eq(returns.status, f.status));
  if (f.partyId) conds.push(eq(returns.partyId, f.partyId));
  if (f.reason) conds.push(eq(returns.returnReason, f.reason));
  if (f.dateFrom) conds.push(gte(returns.dated, f.dateFrom));
  if (f.dateTo) conds.push(lte(returns.dated, f.dateTo));
  return conds.length ? and(...conds) : undefined;
}

/** One page of returns, newest first, plus the total for the pager. */
export async function getReturnsList(f: ReturnsFilter) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = f.pageSize ?? DEFAULT_PAGE_SIZE;
  const where = buildWhere(f);

  const rowsPromise = db
    .select({
      id: returns.id,
      displayId: returns.displayId,
      dated: returns.dated,
      billNo: returns.billNo,
      trackingNo: returns.trackingNo,
      status: returns.status,
      returnReason: returns.returnReason,
      totalValue: returns.totalValue,
      partyName: parties.name,
      brokerName: brokers.name,
      createdAt: returns.createdAt,
      receivedAt: returns.receivedAt,
      bhiwandiTransportValue: returns.bhiwandiTransportValue,
      bhiwandiCharges: returns.bhiwandiCharges,
      // A correlated scalar subquery rather than a join onto return_items:
      // joining the lines in multiplies the return row per line, and
      // un-multiplying it means a GROUP BY naming every column above.
      itemCount: sql<number>`(select count(*)::int from ${returnItems} ri where ri.return_id = ${returns.id})`,
    })
    .from(returns)
    .leftJoin(parties, eq(returns.partyId, parties.id))
    .leftJoin(brokers, eq(returns.brokerId, brokers.id))
    .where(where)
    // id, not dated: `dated` is a business date the user types, so it is
    // neither unique nor monotonic, and paging over it can repeat or skip a
    // row between pages. id is insertion order and never ties.
    .orderBy(desc(returns.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countPromise = db
    .select({ n: count() })
    .from(returns)
    .leftJoin(parties, eq(returns.partyId, parties.id))
    .leftJoin(brokers, eq(returns.brokerId, brokers.id))
    .where(where);

  // TWO concurrent statements — that is this function's entire budget. See the
  // pool note at the top of the file before adding a third.
  const [rows, [countRow]] = await Promise.all([rowsPromise, countPromise]);
  const total = countRow?.n ?? 0;

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type ReturnListRow = Awaited<
  ReturnType<typeof getReturnsList>
>["rows"][number];

/** One return with its quality lines, or null when the id does not exist. */
export async function getReturnDetail(id: number) {
  const [row] = await db
    .select({
      id: returns.id,
      displayId: returns.displayId,
      billNo: returns.billNo,
      entryFor: returns.entryFor,
      trackingNo: returns.trackingNo,
      dated: returns.dated,
      postedOn: returns.postedOn,
      partyId: returns.partyId,
      brokerId: returns.brokerId,
      transportId: returns.transportId,
      partyName: parties.name,
      brokerName: brokers.name,
      transportName: transports.name,
      totalValue: returns.totalValue,
      transportValue: returns.transportValue,
      otherCharges: returns.otherCharges,
      returnReason: returns.returnReason,
      customReason: returns.customReason,
      attachmentUrl: returns.attachmentUrl,
      status: returns.status,
      createdAt: returns.createdAt,
      // Null on all 341 existing rows — the old login identified an office, not
      // a person — so the screen must render "—", never "Unknown user".
      createdByName: users.name,
      receivedAt: returns.receivedAt,
      receivingNotes: returns.receivingNotes,
      bhiwandiTransportValue: returns.bhiwandiTransportValue,
      bhiwandiCharges: returns.bhiwandiCharges,
    })
    .from(returns)
    .leftJoin(parties, eq(returns.partyId, parties.id))
    .leftJoin(brokers, eq(returns.brokerId, brokers.id))
    .leftJoin(transports, eq(returns.transportId, transports.id))
    // This join spends the statement's ONE slot on goods_return.users, for
    // created_by. received_by is resolved separately, below.
    .leftJoin(users, eq(returns.createdBy, users.id))
    .where(eq(returns.id, id));

  if (!row) return null;

  // Sequential, not raced with the query above: it depends on the row existing,
  // and with the pool at 5 there is no reason to spend a second slot on a page
  // that is already fast.
  const items = await db
    .select({
      id: returnItems.id,
      qualityId: returnItems.qualityId,
      // SNAPSHOT FIRST, master second. return_items.quality_name is written at
      // entry beside the foreign key, so a quality renamed since would
      // otherwise silently rewrite what an old return says came back. It is
      // also the only name available for the spreadsheet-imported lines whose
      // quality never matched a master row. Never read either column alone.
      qualityName: sql<string>`coalesce(${returnItems.qualityName}, ${qualities.name})`,
      quantity: returnItems.quantity,
      pieces: returnItems.pieces,
    })
    .from(returnItems)
    .leftJoin(qualities, eq(returnItems.qualityId, qualities.id))
    .where(eq(returnItems.returnId, id))
    .orderBy(asc(returnItems.id));

  // The receiver's name is a SECOND STATEMENT, not a second join.
  //
  // created_by and received_by both point at goods_return.users, and one
  // statement cannot join that table twice under the same name — Drizzle emits
  // `users` for both and Postgres rejects the duplicate. (The original hinted
  // at an alias with `const creator = users`, but that is the same table
  // object, not a real alias; it would have failed identically.) A genuine
  // alias() is possible, and the standalone app chose the extra round trip
  // instead — this port keeps that. Each query stays one-table-one-name, the
  // lookup is a primary-key hit, it runs SEQUENTIALLY so it costs the pool
  // nothing, and it is skipped entirely for a return still in transit.
  let receivedByName: string | null = null;
  if (row.status === "received") {
    const [rec] = await db
      .select({ name: users.name })
      .from(returns)
      .leftJoin(users, eq(returns.receivedBy, users.id))
      .where(eq(returns.id, id));
    receivedByName = rec?.name ?? null;
  }

  return { ...row, items, receivedByName };
}

export type ReturnDetail = NonNullable<
  Awaited<ReturnType<typeof getReturnDetail>>
>;

/**
 * Every return matching a filter, unpaginated and flattened for CSV.
 *
 * Same buildWhere and same ordering as the list, so the file matches the screen
 * it came from. The lines collapse into one text column via string_agg rather
 * than a query per return — that would be 341 round trips today and grows with
 * the table.
 */
export async function getReturnsForExport(f: ReturnsFilter) {
  const where = buildWhere(f);
  // Awaited here rather than handing back the builder (which is only
  // thenable): an un-awaited query is a lazy handle a caller can still append
  // .limit() to, and the pool budget above assumes each statement fires where
  // it is written.
  const rows = await db
    .select({
      displayId: returns.displayId,
      dated: returns.dated,
      entryFor: returns.entryFor,
      billNo: returns.billNo,
      trackingNo: returns.trackingNo,
      partyName: parties.name,
      brokerName: brokers.name,
      reason: returns.returnReason,
      customReason: returns.customReason,
      status: returns.status,
      totalValue: returns.totalValue,
      transportValue: returns.transportValue,
      otherCharges: returns.otherCharges,
      postedOn: returns.postedOn,
      receivedAt: returns.receivedAt,
      bhiwandiTransportValue: returns.bhiwandiTransportValue,
      bhiwandiCharges: returns.bhiwandiCharges,
      // The same snapshot-first coalesce the detail screen uses, spelled out in
      // raw SQL because it lives inside the aggregate. Change one and change
      // the other — a CSV that disagrees with the screen is worse than no CSV.
      items: sql<string>`(
        select string_agg(coalesce(ri.quality_name, q.name) || ' x' || ri.quantity ||
          ' (' || coalesce(ri.pieces::text, '0') || ' pcs)', ' | ')
        from ${returnItems} ri left join ${qualities} q on q.id = ri.quality_id
        where ri.return_id = ${returns.id}
      )`,
    })
    .from(returns)
    .leftJoin(parties, eq(returns.partyId, parties.id))
    .leftJoin(brokers, eq(returns.brokerId, brokers.id))
    .where(where)
    .orderBy(desc(returns.id));

  return rows;
}

export type ReturnExportRow = Awaited<
  ReturnType<typeof getReturnsForExport>
>[number];

// ─── the dashboard's four tiles, and the filter dropdown ──────────────────

/**
 * The Dashboard's headline figures, in ONE query.
 *
 * Ported from the original's `getReturnStats`. Four `count(*) filter (…)`
 * clauses over a single scan rather than four round trips — which matters here
 * for the reason written across this module: the pool is five connections and
 * four concurrent queries is the ceiling for one page. A dashboard that asked
 * these separately would spend most of that budget before rendering anything.
 *
 * `thisMonth` counts on `dated`, the day the return was raised — not
 * `created_at`. That is what the standalone app does and it is the honest
 * reading: a return entered late for last month belongs to last month.
 *
 * `totalValue` comes back as a STRING from postgres.js (numeric always does).
 * It is left as one deliberately — formatting it is the screen's job, and
 * turning it into a float here is how rupee totals quietly lose paise.
 */
export async function getReturnStats() {
  const [row] = await db
    .select({
      total: count(),
      posted: sql<number>`count(*) filter (where ${returns.status} = 'posted')::int`,
      received: sql<number>`count(*) filter (where ${returns.status} = 'received')::int`,
      thisMonth: sql<number>`count(*) filter (where date_trunc('month', ${returns.dated}) = date_trunc('month', current_date))::int`,
      totalValue: sql<string>`coalesce(sum(${returns.totalValue}), 0)`,
    })
    .from(returns);

  return row;
}

export type ReturnStats = Awaited<ReturnType<typeof getReturnStats>>;

/**
 * Parties for the list screen's filter dropdown.
 *
 * An INNER join FROM `returns`, so it offers only the parties that actually
 * appear on one — 5,562 parties exist and a few hundred have ever had a return.
 * Listing the whole master table here would be a dropdown nobody can use, and
 * every extra entry is a filter that yields nothing.
 */
export async function getReturnFilterParties() {
  return db
    .selectDistinct({ id: parties.id, name: parties.name })
    .from(returns)
    .innerJoin(parties, eq(returns.partyId, parties.id))
    .orderBy(asc(parties.name));
}


/**
 * Resolve either form of a return's address to its database id.
 *
 * The list links with the internal id, which is what the standalone app used
 * and what every existing bookmark carries. But the number a person KNOWS is
 * the one printed on the screen and read out on the phone — "LD-0351" — and the
 * two are not the same: LD-0351 is row 341. Typing the familiar one into the
 * address bar gave a 404, which reads as "that return does not exist" about a
 * return that plainly does.
 *
 * So both work. `LD-0351`, `ld-351` and `351` all resolve; a bare number is
 * tried as an id first, because that is what every link in the app uses.
 */
export async function resolveReturnId(raw: string): Promise<number | null> {
  const text = raw.trim();

  const asId = Number(text);
  if (Number.isInteger(asId) && asId > 0) {
    const [hit] = await db
      .select({ id: returns.id })
      .from(returns)
      .where(eq(returns.id, asId))
      .limit(1);
    if (hit) return hit.id;
  }

  // Anything with letters, or a number that matched no row, is tried as a
  // display id — normalised so "ld-351" and "LD-0351" both land.
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const displayId = `LD-${digits.padStart(4, "0")}`;

  const [row] = await db
    .select({ id: returns.id })
    .from(returns)
    .where(eq(returns.displayId, displayId))
    .limit(1);
  return row?.id ?? null;
}
