import {
  CONCERN_STATUSES,
  PRIORITIES,
  type AccountStatus,
  type ConcernPriority,
  type ConcernStatus,
  type UpdateType,
  type UserRole,
  type Visibility,
  type WaitReason,
} from "@/db/help-slip/schema";

/**
 * The wire shapes between `src/app/api/help-slip/*` and the screens, plus the
 * filter vocabularies both halves parse against.
 *
 * Dependency-free on purpose (the same split Order Entry has between
 * `crm.ts` and `crm-query.ts`): a client component and a route handler both
 * import this, so nothing here may reach for `@/db` or `next/server`.
 */

// ─── row shapes ────────────────────────────────────────────────────────────
// Camel-cased at the query layer rather than passed through as the view's
// snake_case, so the screens read like the rest of this repo.

/** The employee dashboard's row, and the My Concerns row. */
export type ConcernRow = {
  id: string;
  concernNumber: string;
  title: string;
  status: ConcernStatus;
  priority: ConcernPriority;
  departmentName: string | null;
  departmentNameHi: string | null;
  createdAt: string;
  lastPublicUpdateAt: string | null;
  isOverdue: boolean;
};

/** The coordinator's row — everything above plus who and to whom. */
export type QueueRow = ConcernRow & {
  employeeName: string | null;
  departmentId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToStatus: AccountStatus | null;
  slaDueAt: string | null;
};

export type NotificationRow = {
  id: string;
  concernId: string | null;
  concernUpdateId: string | null;
  kind: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type DepartmentOption = {
  id: string;
  name: string;
  nameHi: string | null;
};

export type AssigneeOption = { id: string; name: string };

// ─── the employee dashboard ────────────────────────────────────────────────

/**
 * The three buckets PARTITION the statuses — open + inProgress + resolved
 * equals total, exactly. Overlapping buckets would make the cells sum to more
 * than the Total beside them, which reads as a bug even when the maths is fine.
 */
export const KPI_BUCKETS = {
  open: ["new", "waiting"] satisfies ConcernStatus[],
  inProgress: ["in_progress"] satisfies ConcernStatus[],
  resolved: ["resolved", "closed"] satisfies ConcernStatus[],
} as const;

export type KpiBucket = keyof typeof KPI_BUCKETS;

export type DashboardKpis = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
};

export type DashboardSeries = Record<keyof DashboardKpis, number[]>;

export type EmployeeDashboardPayload = {
  kpis: DashboardKpis;
  series: DashboardSeries;
  /** Newest first, capped at 4. */
  recent: ConcernRow[];
  /** Newest first, capped at 5 — the ≥1280px side panel. */
  notifications: NotificationRow[];
  unread: number;
  departmentName: string | null;
  departmentNameHi: string | null;
};

// ─── My Concerns (the employee list) ───────────────────────────────────────

export const CONCERN_PAGE_SIZE = 20;

/** Every key is a real column on `v_concerns`, so ordering happens in Postgres. */
export const CONCERN_SORTS = [
  "concern_number",
  "title",
  "department_name",
  "status",
  "created_at",
  "last_public_update_at",
] as const;
export type ConcernSort = (typeof CONCERN_SORTS)[number];
export type SortDir = "asc" | "desc";

export type ConcernFilters = {
  search: string;
  status: ConcernStatus[];
  /** Inclusive calendar dates, yyyy-mm-dd, matching <input type="date">. */
  from: string | null;
  to: string | null;
  sort: ConcernSort;
  direction: SortDir;
};

export const DEFAULT_CONCERN_FILTERS: ConcernFilters = {
  search: "",
  status: [],
  from: null,
  to: null,
  sort: "created_at",
  direction: "desc",
};

/**
 * The three quick tabs. They PARTITION the statuses, so "All" really is the
 * union of the other two and a person cannot land in a gap between them.
 */
export const LIST_TABS = {
  all: [] as ConcernStatus[],
  open: ["new", "in_progress", "waiting"] as ConcernStatus[],
  resolved: ["resolved", "closed"] as ConcernStatus[],
} as const;
export type ListTab = keyof typeof LIST_TABS;

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Which tab, if any, the current status filter corresponds to. */
export function tabForStatuses(status: ConcernStatus[]): ListTab | null {
  if (status.length === 0) return "all";
  if (sameSet(status, LIST_TABS.open)) return "open";
  if (sameSet(status, LIST_TABS.resolved)) return "resolved";
  return null;
}

/**
 * How many filters the user has actually turned on.
 *
 * A filtered list that does not say it is filtered is how somebody concludes
 * their concern vanished. Sort is not a filter: it changes the order, never
 * the set.
 */
export function activeConcernFilterCount(f: ConcernFilters): number {
  let n = 0;
  if (f.status.length > 0) n += 1;
  if (f.from) n += 1;
  if (f.to) n += 1;
  return n;
}

export function hasConcernFilter(f: ConcernFilters): boolean {
  return activeConcernFilterCount(f) > 0 || f.search.trim().length > 0;
}

// ─── All Concerns (the coordinator's archive) ──────────────────────────────

export const PC_PAGE_SIZE = 25;

export const PC_SORTS = [
  "concern_number",
  "title",
  "employee_name",
  "department_name",
  "status",
  "created_at",
  "last_public_update_at",
] as const;
export type PcSort = (typeof PC_SORTS)[number];

/** The assignee filter's two special values, neither of which is a user id. */
export const ASSIGNEE_ANY = null;
export const ASSIGNEE_UNASSIGNED = "unassigned";

export type PcListFilters = {
  search: string;
  status: ConcernStatus[];
  priority: ConcernPriority[];
  departmentId: string | null;
  /** A profile id, the literal 'unassigned', or null for "anyone". */
  assignee: string | null;
  from: string | null;
  to: string | null;
  sort: PcSort;
  direction: SortDir;
};

export const DEFAULT_PC_FILTERS: PcListFilters = {
  search: "",
  status: [],
  priority: [],
  departmentId: null,
  assignee: ASSIGNEE_ANY,
  from: null,
  to: null,
  // Newest first. This is an ARCHIVE, not a queue — the urgency sort belongs
  // to the dashboard and would be actively wrong here, where somebody is
  // looking up a thing they already know about.
  sort: "created_at",
  direction: "desc",
};

export function activePcFilterCount(f: PcListFilters): number {
  let n = 0;
  if (f.status.length > 0) n += 1;
  if (f.priority.length > 0) n += 1;
  if (f.departmentId) n += 1;
  if (f.assignee !== ASSIGNEE_ANY) n += 1;
  if (f.from || f.to) n += 1;
  return n;
}

export function hasPcFilter(f: PcListFilters): boolean {
  return activePcFilterCount(f) > 0 || f.search.trim().length > 0;
}

// ─── the coordinator's queue (the PC dashboard) ────────────────────────────

/**
 * The five KPI cells double as the primary filter, so each is a named bucket
 * rather than a raw status list at the call site.
 *
 * `open` is the default and is NOT a cell: it is what you see before touching
 * anything, and it excludes resolved and closed because a queue of finished
 * work is not a queue.
 */
export const QUEUE_BUCKETS = {
  open: null,
  new: ["new"] as ConcernStatus[],
  in_progress: ["in_progress"] as ConcernStatus[],
  waiting: ["waiting"] as ConcernStatus[],
  resolved: ["resolved", "closed"] as ConcernStatus[],
  overdue: null,
} as const;

export type QueueBucket = keyof typeof QUEUE_BUCKETS;

/** Statuses that still want somebody's attention. */
export const OPEN_STATUSES: ConcernStatus[] = ["new", "in_progress", "waiting"];

export type QueueFilters = {
  bucket: QueueBucket;
  departmentId: string | null;
  priority: ConcernPriority[];
  /** Assigned to somebody who is no longer active. */
  needsReassignment: boolean;
};

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  bucket: "open",
  departmentId: null,
  priority: [],
  needsReassignment: false,
};

export function activeQueueFilterCount(f: QueueFilters): number {
  let n = 0;
  if (f.departmentId) n += 1;
  if (f.priority.length > 0) n += 1;
  if (f.needsReassignment) n += 1;
  return n;
}

/** The bucket is a VIEW of the queue as well as a filter on it. */
export function hasQueueFilter(f: QueueFilters): boolean {
  return activeQueueFilterCount(f) > 0 || f.bucket !== "open";
}

export type QueueCounts = {
  new: number;
  in_progress: number;
  waiting: number;
  resolved: number;
  overdue: number;
};

export type InsightsDay = { d: string; filed: number; resolved: number };
export type InsightsDepartment = {
  name: string;
  total: number;
  overdue: number;
};

export type Insights = {
  /**
   * The ACTUAL range used, after clamping (never past today, never inverted,
   * capped at 366 days). A caller that sent an invalid range reads the real
   * one back off the response rather than assuming its request was honoured
   * verbatim — the chart header has to say what it really plotted.
   */
  from: string;
  to: string;
  daily: InsightsDay[];
  byDepartment: InsightsDepartment[];
  resolution: {
    resolvedTotal: number;
    /** Null until something has actually been resolved in the window. */
    medianHours: number | null;
    withinSla: number;
  };
};

/**
 * The aggregates ride on PAGE 0 ONLY.
 *
 * Counts, insights and the department list describe the whole queue, not the
 * page — recomputing them on every "Load more" would run a 30-day aggregate to
 * fetch twenty-five more rows. So they are present on the first page and
 * absent after it, and the screen reads them off `pages[0]`.
 */
export type QueuePayload = {
  rows: QueueRow[];
  total: number;
  hasMore: boolean;
  counts?: QueueCounts;
  insights?: Insights;
  departments?: DepartmentOption[];
};

// ─── list payloads ─────────────────────────────────────────────────────────

export type ConcernListPayload = {
  rows: ConcernRow[];
  /** Total matching the filter, from Postgres — not `rows.length`. */
  total: number;
  hasMore: boolean;
};

export type PcListPayload = {
  rows: QueueRow[];
  total: number;
  hasMore: boolean;
  departments: DepartmentOption[];
  assignees: AssigneeOption[];
};

export type NotificationsPayload = {
  items: NotificationRow[];
  hasMore: boolean;
};

// ─── one concern: the detail page and the coordinator's workspace ──────────

/**
 * Everything BOTH screens read about a single concern.
 *
 * Note what is NOT on it: `employeeId`. The one question a screen actually
 * asks — "is this mine?" — is answered on the server as `isMine`, so a profile
 * id never reaches the browser and nothing can be tempted to send one back up
 * as a parameter. Same reasoning as `HelpSlipClientSession` in context.tsx.
 */
export type ConcernDetail = {
  id: string;
  concernNumber: string;
  title: string;
  status: ConcernStatus;
  priority: ConcernPriority;
  visibility: Visibility;
  departmentName: string | null;
  departmentNameHi: string | null;
  /** The ACCOUNT that filed it. This is identity. */
  employeeName: string | null;
  /**
   * The name typed into the Name box on the form. Free text, often null, and
   * NOT identity — render it as what somebody wrote on the slip, never as who
   * the concern belongs to.
   */
  filedForName: string | null;
  /** Whether the person reading this is the person who raised it. */
  isMine: boolean;
  assignedTo: string | null;
  assignedToName: string | null;
  acceptedSolutionId: string | null;
  resolutionMessage: string | null;
  waitReason: WaitReason | null;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  lastPublicUpdateAt: string | null;
  slaDueAt: string | null;
  isOverdue: boolean;
};

/** One of the up-to-three fixes the raiser proposed. `position` is 1..3. */
export type ConcernSolutionRow = {
  id: string;
  position: number;
  body: string;
};

export type TimelineEvent = {
  id: string;
  createdAt: string;
  type: UpdateType;
  message: string | null;
  /**
   * ⚠️ Coordinator-only. A row carrying `true` must never be sent to an
   * employee — the route does not select them for a non-staff viewer, the
   * `v_concern_updates` view refuses them before that, and `<Timeline>`
   * filters them again before it groups. Three locks, one door.
   */
  isInternal: boolean;
  actorName: string;
  actorRole: UserRole | null;
  /** Renders "You" instead of the name when the reader is the actor. */
  isOwnAction: boolean;
  oldStatus: ConcernStatus | null;
  newStatus: ConcernStatus | null;
  /**
   * 1 | 2 | 3, on the resolution row only — which of the raiser's own
   * suggested solutions was accepted. The line this product exists to produce.
   */
  acceptedSolutionPosition: number | null;
};

export type ConcernDetailPayload = {
  concern: ConcernDetail;
  solutions: ConcernSolutionRow[];
  updates: TimelineEvent[];
  /** Staff only — who a concern can be handed to. Empty for an employee. */
  assignees: AssigneeOption[];
  /** Rendering hint. RLS is the boundary; this only picks which controls draw. */
  viewerIsStaff: boolean;
};

// ─── raising one ───────────────────────────────────────────────────────────

/** Three, because the paper HELP SLIP has three lines. Not an arbitrary cap. */
export const MAX_SOLUTIONS = 3;
export const TITLE_SOFT_MAX = 60;
/**
 * Generous, and far above the soft cap. The soft cap is advice ("keep it
 * short"); this is the point at which a title has clearly become the
 * description and belongs in a suggested solution instead.
 */
export const TITLE_HARD_MAX = 140;
export const SOLUTION_MAX = 500;
export const NAME_MAX = 120;
export const MESSAGE_MAX = 4000;
export const NOTE_MAX = 2000;

export type RaiseConcernResult = {
  concernId: string;
  concernNumber: string;
  /** false when an earlier attempt with the same request id already filed it. */
  created: boolean;
};

export type DepartmentsPayload = { departments: DepartmentOption[] };

// ─── parsing, shared by the URL and the route handler ──────────────────────

const VALID_STATUSES = new Set<string>(CONCERN_STATUSES);
const VALID_PRIORITIES = new Set<string>(PRIORITIES);

export function parseStatusParam(raw: string | null): ConcernStatus[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ConcernStatus => VALID_STATUSES.has(s));
}

export function parsePriorityParam(raw: string | null): ConcernPriority[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ConcernPriority => VALID_PRIORITIES.has(s));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A yyyy-mm-dd or nothing. Anything else is dropped rather than passed on. */
export function parseDateParam(raw: string | null): string | null {
  return raw && DATE_RE.test(raw) ? raw : null;
}

export function parseSort<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(raw ?? "")
    ? (raw as T)
    : fallback;
}

export function parseDirection(raw: string | null): SortDir {
  return raw === "asc" ? "asc" : "desc";
}

export function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseQueueBucket(raw: string | null): QueueBucket {
  return raw && raw in QUEUE_BUCKETS ? (raw as QueueBucket) : "open";
}
