import {
  and,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { HelpSlipDb } from "@/db/help-slip/rls";
import {
  concernSolutions,
  departments,
  notifications,
  profiles,
  vConcernUpdates,
  vConcerns,
  type AccountStatus,
  type ConcernPriority,
  type ConcernStatus,
  type UpdateType,
  type UserRole,
  type Visibility,
  type WaitReason,
} from "@/db/help-slip/schema";
import { isStaff, type HelpSlipSession } from "@/lib/help-slip/authz";
import { cumulativeByDay } from "./series";
import {
  CONCERN_PAGE_SIZE,
  KPI_BUCKETS,
  OPEN_STATUSES,
  PC_PAGE_SIZE,
  QUEUE_BUCKETS,
  type AssigneeOption,
  type ConcernDetail,
  type ConcernDetailPayload,
  type ConcernFilters,
  type ConcernListPayload,
  type ConcernRow,
  type ConcernSolutionRow,
  type DepartmentOption,
  type EmployeeDashboardPayload,
  type Insights,
  type NotificationRow,
  type NotificationsPayload,
  type PcListFilters,
  type PcListPayload,
  type QueueCounts,
  type QueueFilters,
  type QueuePayload,
  type QueueRow,
  type SortDir,
  type TimelineEvent,
} from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EVERY read of ld_help_slip lives here, and every one of them takes a `db`
 *  handed in by the caller — never one it opened itself.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * That signature is the whole point. `withHelpSlip()` opens a TRANSACTION, a
 * transaction PINS a pooled connection, and the pool is capped at 5 (see
 * src/db/index.ts and the concurrency warning in src/db/help-slip/rls.ts —
 * fanning out twelve of these at once wedged the pool during development).
 * So a route handler opens exactly ONE `withCurrentUser` and calls as many of
 * these as it needs inside it; sequential queries within one transaction are
 * free. Nothing in this file may call `withHelpSlip` or `withCurrentUser`.
 *
 * Concerns are read through the `v_concerns` VIEW and never the base table.
 * The view is `security_invoker`, so it applies the RLS policy of whoever
 * `withHelpSlip` said we are — and it pre-computes `sla_due_at`, `is_overdue`
 * and `age_hours` and denormalises the department/employee/assignee names, so
 * no screen has to join and two screens cannot disagree about what is late.
 *
 * `dispatch_config` is never touched. It holds WhatsApp credentials and is
 * deny-all by design.
 */

// ─── column selections ─────────────────────────────────────────────────────
// Named, never `select *`. A column added to the view upstream must not
// silently start crossing mobile data to every employee's phone.

const CONCERN_COLUMNS = {
  id: vConcerns.id,
  concernNumber: vConcerns.concernNumber,
  title: vConcerns.title,
  status: vConcerns.status,
  priority: vConcerns.priority,
  departmentName: vConcerns.departmentName,
  departmentNameHi: vConcerns.departmentNameHi,
  createdAt: vConcerns.createdAt,
  lastPublicUpdateAt: vConcerns.lastPublicUpdateAt,
  isOverdue: vConcerns.isOverdue,
} as const;

const QUEUE_COLUMNS = {
  ...CONCERN_COLUMNS,
  employeeName: vConcerns.employeeName,
  departmentId: vConcerns.departmentId,
  assignedTo: vConcerns.assignedTo,
  assignedToName: vConcerns.assignedToName,
  assignedToStatus: vConcerns.assignedToStatus,
  slaDueAt: vConcerns.slaDueAt,
} as const;

type RawConcern = {
  id: string | null;
  concernNumber: string | null;
  title: string | null;
  status: ConcernStatus | null;
  priority: ConcernPriority | null;
  departmentName: string | null;
  departmentNameHi: string | null;
  createdAt: Date | null;
  lastPublicUpdateAt: Date | null;
  isOverdue: boolean | null;
};

type RawQueue = RawConcern & {
  employeeName: string | null;
  departmentId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToStatus: AccountStatus | null;
  slaDueAt: Date | null;
};

/**
 * Drizzle types every column of an `.existing()` view as nullable, because a
 * view definition carries no NOT NULL information. In `v_concerns` these five
 * are `c.id`, `c.concern_number`, `c.title`, `c.status`, `c.priority` and
 * `c.created_at` selected straight off `concerns`, where all six ARE
 * `not null` — so the assertions below restate what the table already
 * guarantees rather than papering over a real absence. Everything genuinely
 * nullable (department name, assignee, last update) stays nullable.
 */
function toConcernRow(r: RawConcern): ConcernRow {
  return {
    id: r.id as string,
    concernNumber: r.concernNumber as string,
    title: r.title as string,
    status: r.status as ConcernStatus,
    priority: r.priority as ConcernPriority,
    departmentName: r.departmentName,
    departmentNameHi: r.departmentNameHi,
    createdAt: (r.createdAt as Date).toISOString(),
    lastPublicUpdateAt: r.lastPublicUpdateAt?.toISOString() ?? null,
    isOverdue: r.isOverdue ?? false,
  };
}

function toQueueRow(r: RawQueue): QueueRow {
  return {
    ...toConcernRow(r),
    employeeName: r.employeeName,
    departmentId: r.departmentId,
    assignedTo: r.assignedTo,
    assignedToName: r.assignedToName,
    assignedToStatus: r.assignedToStatus,
    slaDueAt: r.slaDueAt?.toISOString() ?? null,
  };
}

// ─── small SQL helpers ─────────────────────────────────────────────────────

/**
 * Escape the ilike metacharacters so a search for "50%" means fifty percent
 * rather than "everything". Postgres treats backslash as the ilike escape by
 * default, so this needs no ESCAPE clause.
 *
 * Note this is NOT an injection defence — drizzle binds the pattern as a
 * parameter. It is a correctness one: without it a `%` the user typed is a
 * wildcard they did not ask for.
 */
function ilikePattern(raw: string): string {
  return `%${raw.replace(/([\\%_])/g, "\\$1")}%`;
}

/** `to` is inclusive, so the upper bound is the following midnight. */
function nextDay(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function createdBetween(
  from: string | null,
  to: string | null,
): (SQL | undefined)[] {
  return [
    from
      ? sql`${vConcerns.createdAt} >= ${`${from}T00:00:00`}::timestamptz`
      : undefined,
    // The next midnight, not the bare date: a concern filed at 16:20 on the
    // chosen day would otherwise be silently excluded.
    to
      ? sql`${vConcerns.createdAt} < ${`${nextDay(to)}T00:00:00`}::timestamptz`
      : undefined,
  ];
}

const SORT_COLUMNS = {
  concern_number: vConcerns.concernNumber,
  title: vConcerns.title,
  employee_name: vConcerns.employeeName,
  department_name: vConcerns.departmentName,
  status: vConcerns.status,
  created_at: vConcerns.createdAt,
  last_public_update_at: vConcerns.lastPublicUpdateAt,
} as const;

/**
 * `nulls last` in BOTH directions, deliberately. Postgres defaults to nulls
 * last on ASC and nulls FIRST on DESC — and a concern with no public update
 * yet is not "the most recently updated one". An untouched row sorts last
 * either way.
 */
function orderBy(column: keyof typeof SORT_COLUMNS, dir: SortDir): SQL[] {
  const col = SORT_COLUMNS[column];
  const primary =
    dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`;
  // A stable tiebreak. Without it two rows sharing a sort value can swap
  // places between pages, and the same concern appears twice — or not at all.
  return column === "concern_number"
    ? [primary]
    : [primary, sql`${vConcerns.concernNumber} desc`];
}

async function countMatching(
  db: HelpSlipDb,
  where: SQL | undefined,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vConcerns)
    .where(where);
  return rows[0]?.n ?? 0;
}

// ─── reference data ────────────────────────────────────────────────────────

export async function loadDepartments(
  db: HelpSlipDb,
): Promise<DepartmentOption[]> {
  const rows = await db
    .select({
      id: departments.id,
      name: departments.name,
      nameHi: departments.nameHi,
    })
    .from(departments)
    .where(eq(departments.status, "active"))
    .orderBy(departments.name);
  return rows;
}

/** The assignee filter's options — staff who can hold a concern. */
export async function loadAssignees(db: HelpSlipDb): Promise<AssigneeOption[]> {
  const rows = await db
    .select({ id: profiles.id, name: profiles.fullName })
    .from(profiles)
    .where(
      and(
        inArray(profiles.role, ["pc", "admin"]),
        eq(profiles.status, "active"),
      ),
    )
    .orderBy(profiles.fullName);
  return rows;
}

// ─── the employee dashboard ────────────────────────────────────────────────

/**
 * Bounded on purpose. The KPI counts are derived from this one set rather than
 * from four extra count queries, so the cap is also the point at which the
 * counts would start to under-report. 200 is far beyond what one person files
 * — an employee raises a handful a year — but if that ever stops being true
 * the fix is a summary aggregate, not a bigger number.
 */
export const MY_CONCERNS_CAP = 200;

export async function loadEmployeeDashboard(
  db: HelpSlipDb,
  session: HelpSlipSession,
): Promise<EmployeeDashboardPayload> {
  // The `.eq()` is a narrowing convenience. RLS is what actually restricts
  // this to the caller's own rows; removing it would change nothing about
  // safety, only about how much Postgres has to scan.
  const raw = await db
    .select(CONCERN_COLUMNS)
    .from(vConcerns)
    .where(eq(vConcerns.employeeId, session.profileId))
    .orderBy(sql`${vConcerns.createdAt} desc nulls last`)
    .limit(MY_CONCERNS_CAP);

  const concerns = raw.map(toConcernRow);

  const inBucket = (statuses: readonly string[]) =>
    concerns.filter((c) => statuses.includes(c.status));

  const kpis = {
    total: concerns.length,
    open: inBucket(KPI_BUCKETS.open).length,
    inProgress: inBucket(KPI_BUCKETS.inProgress).length,
    resolved: inBucket(KPI_BUCKETS.resolved).length,
  };

  // Derived from the SAME buckets the counts use. If the two ever disagreed a
  // card would show a line that does not end at its own figure, which is the
  // one way a sparkline can actively lie — see src/lib/help-slip/series.ts.
  const filedDates = (statuses?: readonly string[]) =>
    (statuses ? inBucket(statuses) : concerns).map((c) => c.createdAt);

  const series = {
    total: cumulativeByDay(filedDates()),
    open: cumulativeByDay(filedDates(KPI_BUCKETS.open)),
    inProgress: cumulativeByDay(filedDates(KPI_BUCKETS.inProgress)),
    resolved: cumulativeByDay(filedDates(KPI_BUCKETS.resolved)),
  };

  // Sequential, NOT Promise.all. These share one pinned connection inside the
  // caller's single transaction, so running them in parallel would not be
  // faster — postgres.js serialises statements on a connection anyway — and
  // the habit is the one src/db/help-slip/rls.ts warns about.
  const recentNotifications = await loadRecentNotifications(db, session, 5);
  const unread = await countUnreadNotifications(db, session);
  const department = await loadDepartmentName(db, session.departmentId);

  return {
    kpis,
    series,
    recent: concerns.slice(0, 4),
    notifications: recentNotifications,
    unread,
    departmentName: department?.name ?? null,
    departmentNameHi: department?.nameHi ?? null,
  };
}

async function loadDepartmentName(
  db: HelpSlipDb,
  departmentId: string | null,
): Promise<{ name: string; nameHi: string | null } | null> {
  if (!departmentId) return null;
  const rows = await db
    .select({ name: departments.name, nameHi: departments.nameHi })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── My Concerns ───────────────────────────────────────────────────────────

export async function loadMyConcerns(
  db: HelpSlipDb,
  session: HelpSlipSession,
  filters: ConcernFilters,
  page: number,
): Promise<ConcernListPayload> {
  const term = filters.search.trim();
  const pattern = term ? ilikePattern(term) : null;

  const where = and(
    eq(vConcerns.employeeId, session.profileId),
    pattern
      ? or(
          ilike(vConcerns.title, pattern),
          ilike(vConcerns.concernNumber, pattern),
        )
      : undefined,
    filters.status.length > 0
      ? inArray(vConcerns.status, filters.status)
      : undefined,
    ...createdBetween(filters.from, filters.to),
  );

  const offset = page * CONCERN_PAGE_SIZE;
  const rows = await db
    .select(CONCERN_COLUMNS)
    .from(vConcerns)
    .where(where)
    .orderBy(...orderBy(filters.sort, filters.direction))
    .limit(CONCERN_PAGE_SIZE)
    .offset(offset);

  const total = await countMatching(db, where);

  return {
    rows: rows.map(toConcernRow),
    total,
    hasMore: offset + rows.length < total,
  };
}

// ─── All Concerns (the archive) ────────────────────────────────────────────

export async function loadAllConcerns(
  db: HelpSlipDb,
  filters: PcListFilters,
  page: number,
): Promise<PcListPayload> {
  const term = filters.search.trim();
  const pattern = term ? ilikePattern(term) : null;

  const where = and(
    // Search covers the three things a coordinator actually remembers: the
    // number somebody read out to them, a word from the title, and the NAME
    // of the person who raised it — which the employee's own list has no need
    // of and this screen cannot work without.
    pattern
      ? or(
          ilike(vConcerns.title, pattern),
          ilike(vConcerns.concernNumber, pattern),
          ilike(vConcerns.employeeName, pattern),
        )
      : undefined,
    filters.status.length > 0
      ? inArray(vConcerns.status, filters.status)
      : undefined,
    filters.priority.length > 0
      ? inArray(vConcerns.priority, filters.priority)
      : undefined,
    filters.departmentId
      ? eq(vConcerns.departmentId, filters.departmentId)
      : undefined,
    filters.assignee === "unassigned"
      ? isNull(vConcerns.assignedTo)
      : filters.assignee
        ? eq(vConcerns.assignedTo, filters.assignee)
        : undefined,
    ...createdBetween(filters.from, filters.to),
  );

  const offset = page * PC_PAGE_SIZE;
  const rows = await db
    .select(QUEUE_COLUMNS)
    .from(vConcerns)
    .where(where)
    .orderBy(...orderBy(filters.sort, filters.direction))
    .limit(PC_PAGE_SIZE)
    .offset(offset);

  const total = await countMatching(db, where);
  const departmentOptions = await loadDepartments(db);
  const assigneeOptions = await loadAssignees(db);

  return {
    rows: rows.map(toQueueRow),
    total,
    hasMore: offset + rows.length < total,
    departments: departmentOptions,
    assignees: assigneeOptions,
  };
}

// ─── the coordinator's queue ───────────────────────────────────────────────

export async function loadQueue(
  db: HelpSlipDb,
  filters: QueueFilters,
  page: number,
  range: { from: string; to: string },
): Promise<QueuePayload> {
  const where = and(
    filters.bucket === "overdue"
      ? // Overdue is already defined as an OPEN concern past its SLA, so this
        // needs no status clause of its own — and adding one would silently
        // disagree with the KPI count, which comes from the same expression
        // in the view.
        eq(vConcerns.isOverdue, true)
      : inArray(vConcerns.status, QUEUE_BUCKETS[filters.bucket] ?? OPEN_STATUSES),
    filters.departmentId
      ? eq(vConcerns.departmentId, filters.departmentId)
      : undefined,
    filters.priority.length > 0
      ? inArray(vConcerns.priority, filters.priority)
      : undefined,
    filters.needsReassignment
      ? // Somebody IS assigned, and that somebody has been deactivated.
        // Without the not-null this would also catch every unassigned
        // concern, which is a different problem with a different fix.
        and(
          isNotNull(vConcerns.assignedTo),
          ne(vConcerns.assignedToStatus, "active"),
        )
      : undefined,
  );

  const offset = page * PC_PAGE_SIZE;

  /**
   * THE DEFAULT SORT, and the reason this screen works:
   *
   *   1. overdue first        — the only thing that is actually late
   *   2. priority descending  — the enum is declared low < normal < high <
   *                             urgent, so DESC really is most-urgent-first
   *   3. oldest first         — a thing waiting three days outranks the same
   *                             thing waiting three hours
   *
   * Applied on every request, never stored as a preference: the right first
   * row must not depend on what somebody clicked last week.
   */
  const rows = await db
    .select(QUEUE_COLUMNS)
    .from(vConcerns)
    .where(where)
    .orderBy(
      sql`${vConcerns.isOverdue} desc nulls last`,
      sql`${vConcerns.priority} desc`,
      sql`${vConcerns.createdAt} asc nulls last`,
    )
    .limit(PC_PAGE_SIZE)
    .offset(offset);

  const total = await countMatching(db, where);

  const base = {
    rows: rows.map(toQueueRow),
    total,
    hasMore: offset + rows.length < total,
  };

  // The aggregates describe the whole queue, not this page. Running a 30-day
  // insights aggregate again to fetch twenty-five more rows would be the
  // expensive half of the request doing no new work, so pages after the first
  // carry rows only and the screen keeps reading page 0's copy.
  if (page > 0) return base;

  return {
    ...base,
    counts: await loadQueueCounts(db),
    insights: await loadInsights(db, range),
    departments: await loadDepartments(db),
  };
}

/**
 * All five KPI numbers in ONE round trip.
 *
 * It reads `v_concerns`, which is `security_invoker`, so the counts are the
 * CALLER's: a coordinator without `hr_access` counts a smaller queue than one
 * with it, and neither is told the other exists. Counting the base table
 * would leak the existence of confidential concerns through the numbers even
 * though the rows themselves stayed hidden.
 *
 * The standalone app calls a `pc_queue_counts()` function for this. We do not:
 * that function's signature is owned by the other repo (`pc_dashboard_insights`
 * already changed shape once, in migration 0037), and a signature change there
 * would break this screen silently. The expression is three lines, it reads
 * the same view the function reads, and it is spelled out here.
 */
export async function loadQueueCounts(db: HelpSlipDb): Promise<QueueCounts> {
  const rows = await db
    .select({
      countNew: sql<number>`count(*) filter (where ${vConcerns.status} = 'new')::int`,
      countInProgress: sql<number>`count(*) filter (where ${vConcerns.status} = 'in_progress')::int`,
      countWaiting: sql<number>`count(*) filter (where ${vConcerns.status} = 'waiting')::int`,
      countResolved: sql<number>`count(*) filter (where ${vConcerns.status} in ('resolved', 'closed'))::int`,
      countOverdue: sql<number>`count(*) filter (where ${vConcerns.isOverdue})::int`,
    })
    .from(vConcerns);

  const r = rows[0];
  return {
    new: r?.countNew ?? 0,
    in_progress: r?.countInProgress ?? 0,
    waiting: r?.countWaiting ?? 0,
    resolved: r?.countResolved ?? 0,
    overdue: r?.countOverdue ?? 0,
  };
}

/** Never past today, never inverted, never more than a year wide. */
export function clampInsightsRange(from: string, to: string) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const upper = to > todayKey ? todayKey : to;
  const earliest = new Date(`${upper}T00:00:00`);
  earliest.setDate(earliest.getDate() - 365);
  const earliestKey = `${earliest.getFullYear()}-${String(earliest.getMonth() + 1).padStart(2, "0")}-${String(earliest.getDate()).padStart(2, "0")}`;

  // A date picker can send `to` in the future or `from` after `to`, and a
  // coordinator fat-fingering a 1990 start date must not generate one row per
  // day back to 1990.
  let lower = from > upper ? upper : from;
  if (lower < earliestKey) lower = earliestKey;

  return { from: lower, to: upper };
}

/**
 * The operational half of the coordinator dashboard: what has been HAPPENING,
 * as opposed to the KPI strip's "what is true right now".
 *
 * Counted in Postgres. The alternative — fetching rows and counting them in
 * the browser — breaks the rule that no screen fetches full history, and would
 * put a year of concerns down mobile data to draw a 30px bar.
 */
export async function loadInsights(
  db: HelpSlipDb,
  range: { from: string; to: string },
): Promise<Insights> {
  const { from, to } = clampInsightsRange(range.from, range.to);

  // Two pre-aggregated CTEs joined onto the day series, rather than joining
  // the view twice onto `days` directly: the latter is what the standalone
  // app's RPC does, and it double-counts (a day with 2 filed and 3 resolved
  // reports 6 of each, because `count(f.id)` sees the cross product).
  const daily = await db.execute<{
    d: string;
    filed: number;
    resolved: number;
  }>(sql`
    with days as (
      select generate_series(${from}::date, ${to}::date, interval '1 day')::date as d
    ),
    filed as (
      select created_at::date as d, count(*)::int as n
      from ld_help_slip.v_concerns
      group by 1
    ),
    resolved as (
      select resolved_at::date as d, count(*)::int as n
      from ld_help_slip.v_concerns
      where resolved_at is not null
      group by 1
    )
    select to_char(days.d, 'YYYY-MM-DD') as d,
           coalesce(filed.n, 0)    as filed,
           coalesce(resolved.n, 0) as resolved
    from days
    left join filed    on filed.d = days.d
    left join resolved on resolved.d = days.d
    order by days.d
  `);

  // Scoped to everything the caller can see rather than to the date window:
  // "where do concerns come from" is a standing question about the department
  // mix, not about one month of it.
  const byDepartment = await db.execute<{
    name: string;
    total: number;
    overdue: number;
  }>(sql`
    select coalesce(department_name, '—') as name,
           count(*)::int                  as total,
           count(*) filter (where is_overdue)::int as overdue
    from ld_help_slip.v_concerns
    group by 1
    order by 2 desc, 1
    limit 8
  `);

  const resolution = await db.execute<{
    resolved_total: number;
    median_hours: number | null;
    within_sla: number;
  }>(sql`
    select count(*)::int as resolved_total,
           -- Rounded here rather than on the client: "18.5 h" is the fact,
           -- and two screens rounding the same float differently is how they
           -- start to disagree about it.
           round(
             percentile_cont(0.5) within group (
               order by extract(epoch from (resolved_at - created_at)) / 3600.0
             )::numeric, 1
           )::float8 as median_hours,
           count(*) filter (where resolved_at <= sla_due_at)::int as within_sla
    from ld_help_slip.v_concerns
    where resolved_at is not null
      and resolved_at::date >= ${from}::date
      and resolved_at::date <= ${to}::date
  `);

  const res = resolution[0];

  return {
    from,
    to,
    daily: [...daily].map((r) => ({
      d: r.d,
      filed: Number(r.filed),
      resolved: Number(r.resolved),
    })),
    byDepartment: [...byDepartment].map((r) => ({
      name: r.name,
      total: Number(r.total),
      overdue: Number(r.overdue),
    })),
    resolution: {
      resolvedTotal: Number(res?.resolved_total ?? 0),
      medianHours:
        res?.median_hours === null || res?.median_hours === undefined
          ? null
          : Number(res.median_hours),
      withinSla: Number(res?.within_sla ?? 0),
    },
  };
}

/** The default window: the last 30 days ending today. */
export const DEFAULT_INSIGHTS_DAYS = 30;

// ─── one concern ───────────────────────────────────────────────────────────

const DETAIL_COLUMNS = {
  id: vConcerns.id,
  concernNumber: vConcerns.concernNumber,
  title: vConcerns.title,
  status: vConcerns.status,
  priority: vConcerns.priority,
  visibility: vConcerns.visibility,
  departmentName: vConcerns.departmentName,
  departmentNameHi: vConcerns.departmentNameHi,
  employeeId: vConcerns.employeeId,
  employeeName: vConcerns.employeeName,
  filedForName: vConcerns.filedForName,
  assignedTo: vConcerns.assignedTo,
  assignedToName: vConcerns.assignedToName,
  acceptedSolutionId: vConcerns.acceptedSolutionId,
  resolutionMessage: vConcerns.resolutionMessage,
  waitReason: vConcerns.waitReason,
  createdAt: vConcerns.createdAt,
  resolvedAt: vConcerns.resolvedAt,
  closedAt: vConcerns.closedAt,
  lastPublicUpdateAt: vConcerns.lastPublicUpdateAt,
  slaDueAt: vConcerns.slaDueAt,
  isOverdue: vConcerns.isOverdue,
} as const;

/**
 * ONE concern, or null.
 *
 * NULL FOR "NOT YOURS" IS THE POINT, not an oversight. RLS answers a concern
 * you may not read with ZERO ROWS — it does not raise — so a guessed uuid and
 * a typo'd one produce the identical answer. The screen turns both into an
 * ordinary "Not found", and that indistinguishability IS the security
 * property: a 403 would confirm the id exists.
 *
 * `employeeId` is read but never returned. The one question a screen asks of
 * it — "is this mine?" — is answered here, so no profile id crosses the wire.
 */
export async function loadConcernDetail(
  db: HelpSlipDb,
  session: HelpSlipSession,
  concernId: string,
): Promise<ConcernDetail | null> {
  const rows = await db
    .select(DETAIL_COLUMNS)
    .from(vConcerns)
    .where(eq(vConcerns.id, concernId))
    .limit(1);

  const r = rows[0];
  if (!r) return null;

  return {
    // Same assertion pattern as toConcernRow: drizzle types every column of an
    // `.existing()` view as nullable because a view carries no NOT NULL
    // information, and these six are `not null` on `concerns` itself.
    id: r.id as string,
    concernNumber: r.concernNumber as string,
    title: r.title as string,
    status: r.status as ConcernStatus,
    priority: r.priority as ConcernPriority,
    visibility: r.visibility as Visibility,
    departmentName: r.departmentName,
    departmentNameHi: r.departmentNameHi,
    employeeName: r.employeeName,
    filedForName: r.filedForName,
    isMine: r.employeeId === session.profileId,
    assignedTo: r.assignedTo,
    assignedToName: r.assignedToName,
    acceptedSolutionId: r.acceptedSolutionId,
    resolutionMessage: r.resolutionMessage,
    waitReason: r.waitReason as WaitReason | null,
    createdAt: (r.createdAt as Date).toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    lastPublicUpdateAt: r.lastPublicUpdateAt?.toISOString() ?? null,
    slaDueAt: r.slaDueAt?.toISOString() ?? null,
    isOverdue: r.isOverdue ?? false,
  };
}

/**
 * The employee's own proposed fixes, in slip order.
 *
 * Read from the base table rather than a view because there is no view — and
 * `solutions_select` is `using (can_read_concern(concern_id))`, the same
 * function the concerns policy defers to, so a solution can never be more
 * readable than the concern it belongs to.
 */
export async function loadConcernSolutions(
  db: HelpSlipDb,
  concernId: string,
): Promise<ConcernSolutionRow[]> {
  const rows = await db
    .select({
      id: concernSolutions.id,
      position: concernSolutions.position,
      body: concernSolutions.body,
    })
    .from(concernSolutions)
    .where(eq(concernSolutions.concernId, concernId))
    .orderBy(concernSolutions.position);
  return rows;
}

/**
 * The timeline, from `v_concern_updates` and never the base table.
 *
 * ⚠️ INTERNAL NOTES. `canSeeInternal` is the SECOND lock, not the first. The
 * view runs with definer semantics on purpose (migration 0010/0014) and its
 * WHERE clause reproduces `updates_select` exactly — `is_internal = false or
 * is_staff()` — so a coordinator-only note is already gone before it reaches
 * this function for an employee. The `.eq(false)` below is here because a
 * future refactor could hand this a staff session by accident, and because
 * "the UI must also never leak that one exists" is a rule this module states
 * in three places rather than one.
 *
 * The view is the only route to the actor's NAME, too: `profiles_select` is
 * self-or-staff, so an employee cannot join `profiles` to find out who
 * answered them.
 */
export async function loadConcernUpdates(
  db: HelpSlipDb,
  session: HelpSlipSession,
  concernId: string,
  canSeeInternal: boolean,
): Promise<TimelineEvent[]> {
  const rows = await db
    .select({
      id: vConcernUpdates.id,
      actorId: vConcernUpdates.actorId,
      actorName: vConcernUpdates.actorName,
      actorRole: vConcernUpdates.actorRole,
      updateType: vConcernUpdates.updateType,
      message: vConcernUpdates.message,
      isInternal: vConcernUpdates.isInternal,
      oldStatus: vConcernUpdates.oldStatus,
      newStatus: vConcernUpdates.newStatus,
      createdAt: vConcernUpdates.createdAt,
      acceptedSolutionPosition: vConcernUpdates.acceptedSolutionPosition,
    })
    .from(vConcernUpdates)
    .where(
      and(
        eq(vConcernUpdates.concernId, concernId),
        canSeeInternal ? undefined : eq(vConcernUpdates.isInternal, false),
      ),
    )
    .orderBy(
      sql`${vConcernUpdates.createdAt} asc`,
      // ── the tiebreak, and it is load-bearing ──────────────────────────
      // A hold writes the NOTE and then moves the status, and a reopen does
      // the same. Both happen inside ONE transaction here (the source needed
      // two round trips), and `created_at default now()` is TRANSACTION START
      // TIME in Postgres — so the note and the trigger's status row carry the
      // identical timestamp and a bare `order by created_at` returns them in
      // whatever order the planner feels like. This pins it: the reason, then
      // the state change. Migration 0014 fixed the same class of bug upstream
      // by collapsing a resolve into one row.
      sql`case when ${vConcernUpdates.updateType} in ('status_change', 'resolution') then 1 else 0 end asc`,
      // Total order, so two comments posted in the same transaction cannot
      // swap places between two reads of the same thread.
      sql`${vConcernUpdates.id} asc`,
    );

  return rows.map((r) => ({
    id: r.id as string,
    createdAt: (r.createdAt as Date).toISOString(),
    type: r.updateType as UpdateType,
    message: r.message,
    isInternal: r.isInternal ?? false,
    actorName: r.actorName ?? "—",
    actorRole: (r.actorRole as UserRole | null) ?? null,
    isOwnAction: r.actorId === session.profileId,
    oldStatus: (r.oldStatus as ConcernStatus | null) ?? null,
    newStatus: (r.newStatus as ConcernStatus | null) ?? null,
    acceptedSolutionPosition: r.acceptedSolutionPosition ?? null,
  }));
}

/**
 * The whole concern page, in ONE transaction.
 *
 * Four sequential reads inside the caller's single `withCurrentUser`. The
 * source runs four separate queries because they have different cache
 * lifetimes in the browser; here they share a pinned connection and running
 * them in parallel would be no faster (postgres.js serialises statements on a
 * connection anyway) while breaking the rule rls.ts warns about.
 */
export async function loadConcernDetailPayload(
  db: HelpSlipDb,
  session: HelpSlipSession,
  concernId: string,
): Promise<ConcernDetailPayload | null> {
  const concern = await loadConcernDetail(db, session, concernId);
  if (!concern) return null;

  const staff = isStaff(session.role);
  const solutions = await loadConcernSolutions(db, concernId);
  const updates = await loadConcernUpdates(db, session, concernId, staff);
  // Only the workspace needs them, and only staff can see the workspace. An
  // employee's page does not ship a directory of coordinators.
  const assignees = staff ? await loadAssignees(db) : [];

  return { concern, solutions, updates, assignees, viewerIsStaff: staff };
}

// ─── notifications ─────────────────────────────────────────────────────────

/**
 * `in_app` only, on every read below.
 *
 * The same table carries whatsapp/sms/email rows, and those are DISPATCH
 * RECORDS for the edge function — not something to read in a list. Showing
 * one would tell somebody the same thing twice, once on screen and once on
 * their phone.
 *
 * RLS scopes this table to `user_id = auth.uid()` with no exception, not even
 * for an admin, so the `.eq()` is narrowing rather than the boundary.
 */
const IN_APP = eq(notifications.channel, "in_app");

function toNotificationRow(r: {
  id: string;
  concernId: string | null;
  concernUpdateId: string | null;
  kind: string;
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRow {
  return {
    id: r.id,
    concernId: r.concernId,
    concernUpdateId: r.concernUpdateId,
    kind: r.kind,
    title: r.title,
    message: r.message,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

const NOTIFICATION_COLUMNS = {
  id: notifications.id,
  concernId: notifications.concernId,
  concernUpdateId: notifications.concernUpdateId,
  kind: notifications.kind,
  title: notifications.title,
  message: notifications.message,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
} as const;

export async function loadRecentNotifications(
  db: HelpSlipDb,
  session: HelpSlipSession,
  limit = 5,
): Promise<NotificationRow[]> {
  const rows = await db
    .select(NOTIFICATION_COLUMNS)
    .from(notifications)
    .where(and(eq(notifications.userId, session.profileId), IN_APP))
    .orderBy(sql`${notifications.createdAt} desc`)
    .limit(limit);
  return rows.map(toNotificationRow);
}

export const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * KEYSET, not offset.
 *
 * Notifications arrive while somebody is reading, and an offset-based page 2
 * would skip whatever the new rows pushed down. A cursor on the timestamp
 * cannot.
 */
export async function loadNotificationsPage(
  db: HelpSlipDb,
  session: HelpSlipSession,
  before: string | null,
): Promise<NotificationsPayload> {
  const rows = await db
    .select(NOTIFICATION_COLUMNS)
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.profileId),
        IN_APP,
        before
          ? sql`${notifications.createdAt} < ${before}::timestamptz`
          : undefined,
      ),
    )
    .orderBy(sql`${notifications.createdAt} desc`)
    .limit(NOTIFICATIONS_PAGE_SIZE);

  return {
    items: rows.map(toNotificationRow),
    // A short page means the end. Asking for one extra row to be sure would
    // cost a request on every page to save one at the very last.
    hasMore: rows.length === NOTIFICATIONS_PAGE_SIZE,
  };
}

export async function countUnreadNotifications(
  db: HelpSlipDb,
  session: HelpSlipSession,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.profileId),
        IN_APP,
        isNull(notifications.readAt),
      ),
    );
  return rows[0]?.n ?? 0;
}

/**
 * Marking read — one row, or every unread one.
 *
 * `read_at` is the only column `authenticated` may update on this table (a
 * column GRANT upstream), and RLS restricts the rows to the caller's own. The
 * `.eq(user_id)` below is belt and braces on top of both.
 *
 * `is null` in the WHERE is not an optimisation: it keeps the original read
 * timestamp when a row is tapped twice, so "when did I first see this" stays
 * answerable.
 */
export async function markNotificationsRead(
  db: HelpSlipDb,
  session: HelpSlipSession,
  target: { id: string } | { all: true },
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, session.profileId),
        IN_APP,
        isNull(notifications.readAt),
        "id" in target ? eq(notifications.id, target.id) : undefined,
      ),
    );
}
