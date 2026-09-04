/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Goods Return — master data (parties · brokers · qualities · transports)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's `lib/master-data.ts`, together with its two
 * "add a name" server actions (`admin/master-data/actions.ts` and
 * `returns/new/master-actions.ts`) and the picker search that lived in
 * `app/api/master/route.ts`. Same live tables, same rules — the standalone app
 * is still running against them, so a behaviour change here is a behaviour
 * change for two apps.
 *
 * ── THESE FOUR TABLES ARE THE SOURCE OF TRUTH, AND THIS IS NOT A SYNC ─────
 *
 * The ERP keeps its own shared lists in `ld_order_entry.lookup_values`, and the
 * two overlap heavily — but all 341 live returns point at THESE rows by integer
 * id, so the names cannot move.
 *
 * On **4 Sep 2026**, at the owner's instruction, every name here with no
 * equivalent in the ERP's list was ADDED to `lookup_values`: **1,014 rows,
 * insert-only, ONE WAY, ONCE**, with the new ids recorded in
 * `_backups/goods_return_2026-09-04/masters-added.json` so the batch stays
 * reversible.
 *
 * That was a top-up, not a sync, and there is no second half waiting to be
 * written. **Nothing in this module may ever write to
 * `ld_order_entry.lookup_values`** — not on add, not on a schedule, not "to
 * keep the two level". A name added here is a Goods Return name until somebody
 * decides otherwise, and a name added over there must never be copied back in,
 * because these ids are what live returns hang from.
 *
 * ── CONCURRENCY ──────────────────────────────────────────────────────────
 *
 * The postgres.js pool is capped at 5 for the whole process (`src/db/index.ts`)
 * and surplus queries do not queue under Supavisor's transaction pooler — they
 * stall, so the page hangs rather than errors. Keep any one page at ≤4
 * concurrent queries. `getMasterList` is the only function here that runs two
 * at once (the page of rows, and the total); everything else is sequential. The
 * admin screen's `Promise.all([getMasterCounts(), getMasterList(...)])` is 3 in
 * flight and is the known-safe composition — do not add a fourth call beside it.
 *
 * ── PERMISSIONS ARE THE CALLER'S JOB ─────────────────────────────────────
 *
 * Nothing here checks a role. The source's two add functions were server
 * actions and opened with `requireRole(...)`; in this shell the gate belongs to
 * the calling server action or route handler, which asks `canManageMasters()`
 * in `./authz` — Head Office only, and that covers BOTH add paths, since the
 * standalone app's `admin` (master-data screen) and `kalbadevi` (quick-add from
 * the entry form) both collapse into `head_office` here. Never reach
 * `addMasterName` from an ungated path.
 *
 * ── ONE FUNCTION FROM THE SOURCE IS DELIBERATELY NOT HERE ────────────────
 *
 * `getFormMasterData()` built a `Record<partyId, Option[]>` out of every row of
 * `party_brokers` and shipped it to the browser alongside every party, quality
 * and transport. It is already dead in the standalone app — the entry form
 * moved to server-side pickers, which is what `searchMasterOptions` and
 * `getBrokersForParty` below serve — and reviving it means a four-query
 * fan-out landing ~12,000 rows in one page payload to answer questions the user
 * asks 50 at a time. If a screen genuinely needs the whole map, decide that
 * deliberately; do not restore it by reflex.
 */
import { and, asc, count, eq, ilike, sql } from "drizzle-orm";

import { goodsReturnDb as db } from "@/db/goods-return";
import {
  brokers,
  parties,
  partyBrokers,
  qualities,
  transports,
} from "@/db/goods-return/schema";

export type Option = { id: number; name: string };

/**
 * All four masters are one shape — `id serial primary key`, `name varchar(255)
 * NOT NULL UNIQUE` — so a single map stands in for the four near-identical
 * branches the source repeated in every function. `MasterType` is derived from
 * the map, so a fifth table cannot be half-added.
 */
const MASTER_TABLE = { parties, brokers, qualities, transports } as const;

export type MasterType = keyof typeof MASTER_TABLE;

/** Tab order for the master-data screen — the standalone app's order. */
export const MASTER_TYPES = Object.keys(MASTER_TABLE) as MasterType[];

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
/** What a picker asks for: a screenful, never the whole table (parties: 5,562). */
const PICKER_LIMIT = 50;
/** The columns are `varchar(255)` — past that Postgres raises, it does not truncate. */
const MAX_NAME_LENGTH = 255;

/**
 * A union of the four Drizzle table types makes `select`/`insert` infer a union
 * result that strict mode rejects. The tables are structurally identical, so one
 * representative type describes all four, and Drizzle builds its SQL from the
 * runtime object — the correct table name is still emitted.
 */
function masterTable(type: MasterType): typeof parties {
  return MASTER_TABLE[type] as typeof parties;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Page numbers arrive from a URL search param, so `Number("abc")` — i.e. NaN —
 * is a normal input. Unguarded, that NaN reaches Postgres as the OFFSET and the
 * whole query is rejected; the source's `Math.max(1, page)` passes NaN straight
 * through.
 */
function toPage(page: number): number {
  return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
}

/** A party id off a query string is untrusted the same way. */
function isValidPartyId(partyId: number | undefined): partyId is number {
  return partyId !== undefined && Number.isInteger(partyId) && partyId > 0;
}

export type MasterListResult = {
  rows: Option[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * One page of a master table, searchable — the master-data screen.
 *
 * Two statements in flight (the rows, and the matching total). That is this
 * function's entire budget; see the pool note in the header before adding a
 * third.
 */
export async function getMasterList(
  type: MasterType,
  q: string,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<MasterListResult> {
  const table = masterTable(type);
  const size = clamp(Math.floor(pageSize) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const current = toPage(page);

  const search = q.trim();
  const where = search ? ilike(table.name, `%${search}%`) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(where)
      .orderBy(asc(table.name))
      .limit(size)
      .offset((current - 1) * size),
    db.select({ n: count() }).from(table).where(where),
  ]);

  const total = totals[0]?.n ?? 0;

  return {
    rows,
    total,
    page: current,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}

export type MasterCounts = Record<MasterType, number>;

/**
 * Row counts for the tab badges.
 *
 * One statement with four scalar sub-selects rather than four `count()` calls:
 * one round trip instead of four, and it cannot fan out past the pool. The
 * `::int` casts are load-bearing — `count(*)` is `bigint`, and postgres.js hands
 * bigints back as STRINGS, so the badges would concatenate instead of add.
 */
export async function getMasterCounts(): Promise<MasterCounts> {
  const rows = await db.execute<MasterCounts>(sql`
    select
      (select count(*)::int from goods_return.parties)    as parties,
      (select count(*)::int from goods_return.brokers)    as brokers,
      (select count(*)::int from goods_return.qualities)  as qualities,
      (select count(*)::int from goods_return.transports) as transports
  `);
  return rows[0] ?? { parties: 0, brokers: 0, qualities: 0, transports: 0 };
}

/**
 * Cheap existence check for the entry screen. Parties and qualities are the two
 * a return cannot be written without, so they are the two tested. `exists`
 * stops at the first row — do not turn this into a count of 5,562.
 */
export async function hasMasterData(): Promise<boolean> {
  const rows = await db.execute<{ ok: boolean }>(sql`
    select exists(select 1 from goods_return.parties)
       and exists(select 1 from goods_return.qualities) as ok
  `);
  return rows[0]?.ok === true;
}

/**
 * The brokers that trade for one party — the lookup the entry form is built
 * around, and the reason `party_brokers` (5,359 pairs) exists.
 *
 * The Broker box filling in only AFTER a Party is chosen is not a nicety:
 * picking a broker who does not trade for that party is a wrong record, and
 * this filter is what prevents it. So the answers are deliberate:
 *
 *   · no party chosen, or a junk id off a query string → EMPTY. An empty Broker
 *     box is the guard working, not a bug to "fix" by listing all 389 brokers.
 *   · the party HAS mappings but none match what was typed → also empty. The
 *     right answer to "this party has no broker called X" is nothing; widening
 *     the search here re-opens exactly the mis-pick above.
 *   · the party has NO mappings AT ALL — a party added from the form minutes
 *     ago — → fall back to every broker, because otherwise the field cannot be
 *     filled and the return cannot be saved at all. Quick-adding a broker
 *     against that party then writes its first mapping, and the party behaves
 *     normally from the next entry on.
 *
 * The fallback costs a second query, so it runs only after an empty result, and
 * sequentially — never alongside the first.
 */
export async function getBrokersForParty(
  partyId: number | undefined,
  q = "",
  limit: number = PICKER_LIMIT,
): Promise<Option[]> {
  if (!isValidPartyId(partyId)) return [];

  const size = clamp(Math.floor(limit) || PICKER_LIMIT, 1, MAX_PAGE_SIZE);
  const search = q.trim();
  const like = `%${search}%`;

  const mapped = await db
    .select({ id: brokers.id, name: brokers.name })
    .from(partyBrokers)
    .innerJoin(brokers, eq(partyBrokers.brokerId, brokers.id))
    .where(
      search
        ? and(eq(partyBrokers.partyId, partyId), ilike(brokers.name, like))
        : eq(partyBrokers.partyId, partyId),
    )
    .orderBy(asc(brokers.name))
    .limit(size);

  if (mapped.length > 0) return mapped;

  // Empty so far means one of two very different things, and only one of them
  // earns the fallback: ask whether this party has ANY broker at all, ignoring
  // the search text.
  const anyMapping = await db
    .select({ brokerId: partyBrokers.brokerId })
    .from(partyBrokers)
    .where(eq(partyBrokers.partyId, partyId))
    .limit(1);

  if (anyMapping.length > 0) return [];

  return db
    .select({ id: brokers.id, name: brokers.name })
    .from(brokers)
    .where(search ? ilike(brokers.name, like) : undefined)
    .orderBy(asc(brokers.name))
    .limit(size);
}

/**
 * Search one master list for a picker — the logic behind the standalone app's
 * `/api/master`, which is what keeps thousands of rows out of the page.
 *
 * NOTE for whoever ports that route: it took `type=party|broker|quality|
 * transport`, singular. This module speaks one vocabulary — the plural
 * `MasterType` — so translate at the route edge rather than letting two names
 * for the same four tables spread through the module.
 *
 * `partyId` is read only for `brokers`, where it is required; see
 * `getBrokersForParty` for what each outcome means.
 */
export async function searchMasterOptions(input: {
  type: MasterType;
  q?: string;
  partyId?: number;
  limit?: number;
}): Promise<Option[]> {
  const search = (input.q ?? "").trim();
  const size = clamp(
    Math.floor(input.limit ?? PICKER_LIMIT) || PICKER_LIMIT,
    1,
    MAX_PAGE_SIZE,
  );

  if (input.type === "brokers") {
    return getBrokersForParty(input.partyId, search, size);
  }

  const table = masterTable(input.type);
  return db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(search ? ilike(table.name, `%${search}%`) : undefined)
    .orderBy(asc(table.name))
    .limit(size);
}

export type AddMasterResult =
  | { ok: true; id: number; name: string; created: boolean }
  | { ok: false; error: string };

/**
 * Add a name to a master list — INSERT-ONLY, and a duplicate is not a failure.
 *
 * The source had two versions of this: the master-data screen's, which reported
 * "already exists" as an error, and the entry form's quick-add, which resolved
 * the duplicate to its id and carried on. One function does both — it always
 * returns the id, and `created` says whether THIS call is what put the row
 * there, so a screen can still print "already exists" without any caller having
 * to treat an ordinary outcome as an error.
 *
 * Why `onConflictDoNothing()` and then a SELECT: all four tables carry a UNIQUE
 * index on `name`, and two people adding the same party on the same morning is
 * ordinary. `onConflictDoNothing()` turns that into a no-op instead of a 23505
 * every caller has to catch — but it also means `returning()` yields NO row on
 * conflict, which is why the existing id is read back with a second statement
 * rather than assumed. The two run sequentially.
 *
 * There is no UPDATE path here and there must not be one: renaming a master row
 * silently rewrites the label on every historic return pointing at it.
 *
 * The UNIQUE index compares the name EXACTLY, so "abc", "ABC" and "ABC." are
 * three separate rows. That is how the standalone app behaves against these same
 * tables — do not add case-folding or punctuation-stripping here, or the two
 * apps will disagree about what already exists. (The 4 Sep top-up compared names
 * stripped to letters and digits, but that was a one-off measurement against a
 * different table; it is not this table's rule.)
 *
 * Validation problems come back as `{ ok: false }`; a database failure THROWS,
 * for the calling action's banner to handle.
 */
export async function addMasterName(
  type: MasterType,
  rawName: string,
  options: { partyId?: number } = {},
): Promise<AddMasterResult> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: "Please enter a name." };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "Name is too long." };

  const table = masterTable(type);

  const inserted = await db
    .insert(table)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: table.id });

  let id = inserted[0]?.id;
  const created = id !== undefined;

  if (id === undefined) {
    const existing = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.name, name))
      .limit(1);
    id = existing[0]?.id;
  }

  // Only reachable if the conflicting row disappeared between the two
  // statements — there is no id to hand back, so say so rather than inventing one.
  if (id === undefined) return { ok: false, error: "Could not add. Please try again." };

  // A broker quick-added while a party is selected is mapped to that party, or
  // it will not come back for that party next time — the Broker box shows only
  // what `party_brokers` says. This runs for an EXISTING broker too: the name
  // being already known says nothing about whether it trades for this party.
  // Ordering is deliberate — the name is committed first and survives even if
  // the mapping insert fails, because the name is what the user typed.
  if (type === "brokers" && isValidPartyId(options.partyId)) {
    await db
      .insert(partyBrokers)
      .values({ partyId: options.partyId, brokerId: id })
      .onConflictDoNothing();
  }

  return { ok: true, id, name, created };
}
