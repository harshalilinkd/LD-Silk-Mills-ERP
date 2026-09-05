import "server-only";

import { and, asc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, occurrences } from "@/db/checklist/schema";
import { addDays, todayIso, type IsoDate } from "./dates";
import type { Frequency } from "./frequency";
import { UPCOMING_WINDOW_DAYS, type OccurrenceStatus } from "./status";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reading the checklist
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THE STATUS IS COMPUTED IN SQL, NOT IN JAVASCRIPT ─────────────────────
 *
 * Only `Scheduled` and `Done` are stored. The four the screen shows are worked
 * out from the planned date, and they are worked out HERE, in the WHERE
 * clause, rather than by fetching everything and filtering after.
 *
 * That is the difference between "give me today's forty rows" and "give me all
 * eleven thousand rows and throw away 10,960 of them". At Linkd Prints' size
 * the second option is a page that takes seconds to load and a payload nobody
 * needed. It also makes the counts on the four cards honest: they are counts of
 * everything matching, not counts of whatever happened to be on this page.
 *
 * ── EVERY QUERY IS SCOPED TO THE VIEWER BEFORE ANYTHING ELSE ─────────────
 *
 * `scopeDoerId` is applied as the FIRST condition and is not optional for a
 * member. A member seeing another member's checklist is a small leak; a member
 * seeing the whole company's is the scorecard screen, which is a performance
 * record. The caller passes their own doer id and there is no code path that
 * lets a non-admin pass somebody else's.
 */

const today = () => todayIso();

/** `Delayed`, `Today`, `Upcoming Focus`, `Scheduled` — as a WHERE fragment. */
function statusCondition(status: OccurrenceStatus, t: IsoDate): SQL {
  const horizon = addDays(t, UPCOMING_WINDOW_DAYS);
  switch (status) {
    case "Done":
      return sql`${occurrences.status} = 'Done'`;
    case "Delayed":
      return sql`${occurrences.status} <> 'Done' and ${occurrences.plannedDate} < ${t}`;
    case "Today":
      return sql`${occurrences.status} <> 'Done' and ${occurrences.plannedDate} = ${t}`;
    case "Upcoming Focus":
      return sql`${occurrences.status} <> 'Done'
        and ${occurrences.plannedDate} > ${t}
        and ${occurrences.plannedDate} <= ${horizon}
        and ${occurrences.frequency} <> 'D'`;
    case "Scheduled":
      // Everything still to come that is NOT in the focus window — which
      // includes every future daily row, by the exclusion above.
      return sql`${occurrences.status} <> 'Done'
        and ${occurrences.plannedDate} > ${t}
        and (${occurrences.plannedDate} > ${horizon} or ${occurrences.frequency} = 'D')`;
  }
}

export type MasterFilters = {
  /** Forced for a member; optional for an admin. */
  scopeDoerId?: number | null;
  doerId?: number | null;
  department?: string | null;
  taskSearch?: string | null;
  frequency?: Frequency | null;
  status?: OccurrenceStatus | null;
  from?: IsoDate | null;
  to?: IsoDate | null;
};

export type MasterRow = {
  id: number;
  occurrenceKey: string;
  taskId: number;
  doerId: number;
  doerName: string;
  department: string | null;
  taskName: string;
  frequency: Frequency;
  plannedDate: IsoDate;
  actualDate: IsoDate | null;
  status: "Scheduled" | "Done";
};

function conditions(f: MasterFilters, t: IsoDate): SQL[] {
  const where: SQL[] = [];

  // First, always, and not negotiable for a member.
  if (f.scopeDoerId != null) where.push(eq(occurrences.doerId, f.scopeDoerId));
  else if (f.doerId != null) where.push(eq(occurrences.doerId, f.doerId));

  if (f.department) where.push(eq(doers.department, f.department));
  if (f.frequency) where.push(eq(occurrences.frequency, f.frequency));
  if (f.from) where.push(gte(occurrences.plannedDate, f.from));
  if (f.to) where.push(lte(occurrences.plannedDate, f.to));
  if (f.taskSearch?.trim()) {
    // `ilike` with a leading wildcard cannot use an index, which is fine at
    // this size and is what somebody searching a task list expects — the words
    // they remember are rarely the first ones in the name.
    const needle = `%${f.taskSearch.trim().replace(/[%_]/g, "\\$&")}%`;
    where.push(sql`${occurrences.taskName} ilike ${needle}`);
  }
  if (f.status) where.push(statusCondition(f.status, t));

  return where;
}

export type MasterPage = {
  rows: MasterRow[];
  total: number;
  today: IsoDate;
  counts: Record<"Today" | "Delayed" | "Done" | "Upcoming Focus", number>;
};

/**
 * One page of the checklist, plus the four headline counts.
 *
 * THREE QUERIES, SEQUENTIAL. The pool is capped at five connections and
 * pipelined statements stall under transaction pooling — the rule this
 * codebase keeps is four concurrent at most, and awaiting them in turn is
 * simpler than counting.
 */
export async function getMasterPage(
  f: MasterFilters,
  page = 1,
  pageSize = 100,
): Promise<MasterPage> {
  const t = today();
  const where = conditions(f, t);
  const clause = where.length > 0 ? and(...where) : undefined;

  const rows = await checklistDb
    .select({
      id: occurrences.id,
      occurrenceKey: occurrences.occurrenceKey,
      taskId: occurrences.taskId,
      doerId: occurrences.doerId,
      doerName: doers.name,
      department: doers.department,
      taskName: occurrences.taskName,
      frequency: occurrences.frequency,
      plannedDate: occurrences.plannedDate,
      actualDate: occurrences.actualDate,
      status: occurrences.status,
    })
    .from(occurrences)
    .innerJoin(doers, eq(doers.id, occurrences.doerId))
    .where(clause)
    // Oldest first: a delayed row from three weeks ago is the one that needs
    // doing, and burying it under next month's schedule is how it stays
    // delayed. `id` breaks ties so paging cannot repeat or skip a row.
    .orderBy(asc(occurrences.plannedDate), asc(occurrences.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await checklistDb
    .select({ n: sql<number>`count(*)::int` })
    .from(occurrences)
    .innerJoin(doers, eq(doers.id, occurrences.doerId))
    .where(clause);

  // The counts deliberately IGNORE the status filter — they are the four
  // buttons that SET it, so counting them under it would make three of them
  // read zero the moment one was pressed.
  const countWhere = conditions({ ...f, status: null }, t);
  const countClause = countWhere.length > 0 ? and(...countWhere) : undefined;
  const horizon = addDays(t, UPCOMING_WINDOW_DAYS);

  const [c] = await checklistDb
    .select({
      done: sql<number>`count(*) filter (where ${occurrences.status} = 'Done')::int`,
      delayed: sql<number>`count(*) filter (where ${occurrences.status} <> 'Done' and ${occurrences.plannedDate} < ${t})::int`,
      today: sql<number>`count(*) filter (where ${occurrences.status} <> 'Done' and ${occurrences.plannedDate} = ${t})::int`,
      upcoming: sql<number>`count(*) filter (where ${occurrences.status} <> 'Done' and ${occurrences.plannedDate} > ${t} and ${occurrences.plannedDate} <= ${horizon} and ${occurrences.frequency} <> 'D')::int`,
    })
    .from(occurrences)
    .innerJoin(doers, eq(doers.id, occurrences.doerId))
    .where(countClause);

  return {
    rows: rows as MasterRow[],
    total: totalRow?.n ?? 0,
    today: t,
    counts: {
      Today: c?.today ?? 0,
      Delayed: c?.delayed ?? 0,
      Done: c?.done ?? 0,
      "Upcoming Focus": c?.upcoming ?? 0,
    },
  };
}

/** The doers and departments the filter dropdowns offer. */
export async function getFilterOptions(): Promise<{
  people: { id: number; name: string; department: string | null }[];
  departments: string[];
}> {
  const people = await checklistDb
    .select({ id: doers.id, name: doers.name, department: doers.department })
    .from(doers)
    // Deleted people leave the dropdowns. Their completed history is still
    // joined and still reads — see `deleteDoer` — but nobody should be able
    // to filter for, or assign to, somebody who has been removed.
    .where(isNull(doers.deletedAt))
    .orderBy(asc(doers.name));

  return {
    people,
    departments: [
      ...new Set(people.map((p) => p.department).filter((d): d is string => !!d)),
    ].sort(),
  };
}
