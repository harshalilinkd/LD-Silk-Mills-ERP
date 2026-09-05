import type { IsoDate } from "./dates";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The dashboard's numbers, and the two rules for reading them
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file exists for a boundary rather than for tidiness. The dashboard is a
 * CLIENT component and it needs these two functions and these types; the
 * queries that produce them are `server-only`. A client component that imports
 * a `server-only` module does not merely fail to compile itself — it fails the
 * whole build, and this codebase has already lost an unrelated page to exactly
 * that mistake once.
 *
 * So: no imports here beyond a type, and nothing in it touches a database.
 * `dashboard-query.ts` re-exports these so a server component can still get
 * everything from one place.
 */

export type DashboardTotals = {
  total: number;
  done: number;
  onTime: number;
  delayed: number;
  dueToday: number;
  upcoming: number;
  scheduled: number;
  /** Average days late, over completed-late rows only. */
  avgDelay: number;
  /** People with at least one row still open in this window. */
  activeDoers: number;
};

export type DepartmentRow = {
  department: string;
  total: number;
  done: number;
  delayed: number;
  dueToday: number;
  upcoming: number;
};

export type DoerDelayRow = {
  doerId: number;
  name: string;
  department: string | null;
  delayed: number;
};

export type Dashboard = {
  today: IsoDate;
  totals: DashboardTotals;
  departments: DepartmentRow[];
  worstDoers: DoerDelayRow[];
};

/**
 * `done ÷ (done + delayed + due today)`.
 *
 * The denominator is what has actually COME ROUND, not everything on the
 * calendar. Counting next March's rows as "not completed" would make this
 * figure track how far into the financial year it is and nothing else — it
 * would start every April near zero and climb regardless of anybody's work.
 *
 * Null, not 0, when nothing has come round. "No work has been due yet" and
 * "no work has been done" are different statements, and only one of them is a
 * criticism.
 */
export function completionRate(t: DashboardTotals): number | null {
  const closed = t.done + t.delayed + t.dueToday;
  return closed === 0 ? null : Math.round((t.done / closed) * 100);
}

/**
 * `on time ÷ done`.
 *
 * Of what was DONE — not of everything. A duty due next week is not evidence
 * of lateness, and including it would drag every score down at the start of a
 * period and let it drift up for no reason as the period filled.
 */
export function onTimeRate(t: { done: number; onTime: number }): number | null {
  return t.done === 0 ? null : Math.round((t.onTime / t.done) * 100);
}
