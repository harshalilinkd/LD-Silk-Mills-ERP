import "server-only";

import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, occurrences } from "@/db/checklist/schema";
import { addDays, todayIso, type IsoDate } from "./dates";
import type {
  Dashboard,
  DashboardTotals,
  DepartmentRow,
  DoerDelayRow,
} from "./figures";
import { UPCOMING_WINDOW_DAYS } from "./status";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The dashboard's figures
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three grouped queries, run in turn, each one aggregating in the database
 * rather than fetching rows and counting them here. At eleven thousand
 * occurrences the difference is a page that loads and a page that does not.
 *
 * ── EVERY FIGURE SAYS WHAT IT IS A FIGURE OF ─────────────────────────────
 *
 * This is the discipline the Goods Return reports screen ended up with, and it
 * applies harder here because these numbers are about people:
 *
 *   ON-TIME %       of what was DONE, not of everything. Something not yet due
 *                   is not evidence of anything, and counting it as a miss
 *                   would make every scorecard rise through the month for no
 *                   reason.
 *   COMPLETION RATE of what has actually come round — done, late, or due today.
 *                   Next month's rows are excluded, or the figure would simply
 *                   track how far into the year it is.
 *   AVERAGE DELAY   over completed-late rows only. A task nobody has done yet
 *                   has no delay, it has an absence, and folding those in
 *                   would let one forgotten duty from March drag a whole
 *                   department's average for the rest of the year.
 *
 * A caveat travels with each of these on screen. A figure quoted in a meeting
 * without its denominator is how a number stops being true.
 */

export type DashboardFilters = {
  scopeDoerId?: number | null;
  doerId?: number | null;
  department?: string | null;
  from?: IsoDate | null;
  to?: IsoDate | null;
};

function conditions(f: DashboardFilters): SQL[] {
  const where: SQL[] = [];
  if (f.scopeDoerId != null) where.push(eq(occurrences.doerId, f.scopeDoerId));
  else if (f.doerId != null) where.push(eq(occurrences.doerId, f.doerId));
  if (f.department) where.push(eq(doers.department, f.department));
  if (f.from) where.push(gte(occurrences.plannedDate, f.from));
  if (f.to) where.push(lte(occurrences.plannedDate, f.to));
  return where;
}

export async function getDashboard(f: DashboardFilters): Promise<Dashboard> {
  const t = todayIso();
  const horizon = addDays(t, UPCOMING_WINDOW_DAYS);
  const where = conditions(f);
  const clause = where.length > 0 ? and(...where) : undefined;

  // Written once and reused, so the dashboard and the master list cannot
  // disagree about what "delayed" means.
  const doneExpr = sql`${occurrences.status} = 'Done'`;
  const openExpr = sql`${occurrences.status} <> 'Done'`;
  const delayedExpr = sql`${openExpr} and ${occurrences.plannedDate} < ${t}`;
  const todayExpr = sql`${openExpr} and ${occurrences.plannedDate} = ${t}`;
  const upcomingExpr = sql`${openExpr} and ${occurrences.plannedDate} > ${t} and ${occurrences.plannedDate} <= ${horizon} and ${occurrences.frequency} <> 'D'`;
  const onTimeExpr = sql`${doneExpr} and ${occurrences.actualDate} <= ${occurrences.plannedDate}`;
  const lateDoneExpr = sql`${doneExpr} and ${occurrences.actualDate} > ${occurrences.plannedDate}`;

  const [totals] = await checklistDb
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${doneExpr})::int`,
      onTime: sql<number>`count(*) filter (where ${onTimeExpr})::int`,
      delayed: sql<number>`count(*) filter (where ${delayedExpr})::int`,
      dueToday: sql<number>`count(*) filter (where ${todayExpr})::int`,
      upcoming: sql<number>`count(*) filter (where ${upcomingExpr})::int`,
      // `coalesce` because an average over no rows is null, and a null here
      // renders as an empty box rather than an honest zero.
      avgDelay: sql<number>`coalesce(avg(${occurrences.actualDate} - ${occurrences.plannedDate}) filter (where ${lateDoneExpr}), 0)::float`,
      activeDoers: sql<number>`count(distinct ${occurrences.doerId}) filter (where ${openExpr})::int`,
    })
    .from(occurrences)
    .innerJoin(doers, eq(doers.id, occurrences.doerId))
    .where(clause);

  const departments = await checklistDb
    .select({
      // Somebody with no department is not dropped — they are grouped under a
      // name that says so. Dropping them would make the department totals add
      // up to less than the headline figure with nothing to explain the gap.
      department: sql<string>`coalesce(nullif(${doers.department}, ''), 'No department')`,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${doneExpr})::int`,
      delayed: sql<number>`count(*) filter (where ${delayedExpr})::int`,
      dueToday: sql<number>`count(*) filter (where ${todayExpr})::int`,
      upcoming: sql<number>`count(*) filter (where ${upcomingExpr})::int`,
    })
    .from(occurrences)
    .innerJoin(doers, eq(doers.id, occurrences.doerId))
    .where(clause)
    .groupBy(sql`coalesce(nullif(${doers.department}, ''), 'No department')`)
    .orderBy(desc(sql`count(*)`));

  const worstDoers = await checklistDb
    .select({
      doerId: occurrences.doerId,
      name: doers.name,
      department: doers.department,
      delayed: sql<number>`count(*) filter (where ${delayedExpr})::int`,
    })
    .from(occurrences)
    .innerJoin(doers, eq(doers.id, occurrences.doerId))
    .where(clause)
    .groupBy(occurrences.doerId, doers.name, doers.department)
    .having(sql`count(*) filter (where ${delayedExpr}) > 0`)
    .orderBy(desc(sql`count(*) filter (where ${delayedExpr})`));

  const totalsRow = totals ?? {
    total: 0, done: 0, onTime: 0, delayed: 0, dueToday: 0,
    upcoming: 0, avgDelay: 0, activeDoers: 0,
  };

  return {
    today: t,
    totals: {
      ...totalsRow,
      scheduled:
        totalsRow.total -
        totalsRow.done -
        totalsRow.delayed -
        totalsRow.dueToday -
        totalsRow.upcoming,
      avgDelay: Math.round((totalsRow.avgDelay ?? 0) * 10) / 10,
    },
    departments,
    worstDoers,
  };
}

// The shapes and the two derived rates live in `./figures`, which has no
// imports and is therefore safe for the dashboard's CLIENT component to pull
// in. Re-exported so a server component can still take everything from here.
export type { Dashboard, DashboardTotals, DepartmentRow, DoerDelayRow };
export { completionRate, onTimeRate } from "./figures";
