import { addDays, daysBetween, type IsoDate } from "./dates";
import type { Frequency } from "./frequency";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The five words a row can be — four of which are never stored
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The database keeps `Scheduled` or `Done`, and nothing else. Today, Delayed
 * and Upcoming Focus are worked out from the planned date every time somebody
 * looks, because they are statements about the calendar rather than facts
 * about the row.
 *
 * Storing them would mean a nightly job rewriting thousands of rows so that
 * yesterday's "Today" becomes "Delayed" — and a night the job does not run is
 * a morning the whole checklist lies. A date comparison cannot fail to run.
 *
 * ── UPCOMING FOCUS EXCLUDES DAILY TASKS, ON PURPOSE ──────────────────────
 *
 * "Due within a week" describes something worth thinking about in advance. A
 * daily duty is due within a week every single day of the year, so including
 * it would bury the six things that genuinely need planning under six hundred
 * that do not. Carried over from the original, which has the same exclusion.
 */

export const OCCURRENCE_STATUSES = [
  "Done",
  "Delayed",
  "Today",
  "Upcoming Focus",
  "Scheduled",
] as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

/** How far ahead "Upcoming Focus" reaches. */
export const UPCOMING_WINDOW_DAYS = 7;

export type StatusInput = {
  status: "Scheduled" | "Done";
  plannedDate: IsoDate;
  frequency: Frequency;
};

export function deriveStatus(row: StatusInput, today: IsoDate): OccurrenceStatus {
  if (row.status === "Done") return "Done";
  if (row.plannedDate < today) return "Delayed";
  if (row.plannedDate === today) return "Today";
  if (row.plannedDate <= addDays(today, UPCOMING_WINDOW_DAYS) && row.frequency !== "D") {
    return "Upcoming Focus";
  }
  return "Scheduled";
}

/**
 * Was it done by the day it was due?
 *
 * Ticking it ON the planned date counts as on time — the duty was for that
 * day, and finishing it at four in the afternoon is not late. Everything the
 * scorecards call "on-time %" comes through here, so the rule lives in one
 * place rather than being re-typed as `actual <= planned` in nine queries.
 */
export function wasOnTime(plannedDate: IsoDate, actualDate: IsoDate | null): boolean {
  return actualDate != null && actualDate <= plannedDate;
}

/** How many days late, or 0 if on time or not yet done. */
export function delayDays(plannedDate: IsoDate, actualDate: IsoDate | null): number {
  if (!actualDate || actualDate <= plannedDate) return 0;
  return daysBetween(plannedDate, actualDate);
}

// ─── how each one looks ───────────────────────────────────────────────────

/**
 * Colour is doing real work here, so it is assigned by MEANING and not by
 * mood: green is finished, red is a promise already broken, amber is one about
 * to be, blue is the ordinary business of the day. Grey is a future date with
 * nothing to say about it yet — which is most of the table, and which is
 * exactly why it should recede.
 */
export const STATUS_META: Record<
  OccurrenceStatus,
  { label: string; dot: string; chip: string; text: string; blurb: string }
> = {
  Done: {
    label: "Done",
    dot: "bg-status-green",
    chip: "bg-status-green-dim text-status-green",
    text: "text-status-green",
    blurb: "Ticked off",
  },
  Delayed: {
    label: "Delayed",
    dot: "bg-status-red",
    chip: "bg-status-red-dim text-status-red",
    text: "text-status-red",
    blurb: "The day it was due has passed",
  },
  Today: {
    label: "Today",
    dot: "bg-status-blue",
    chip: "bg-status-blue-dim text-status-blue",
    text: "text-status-blue",
    blurb: "Due today",
  },
  "Upcoming Focus": {
    label: "Upcoming Focus",
    dot: "bg-status-amber",
    chip: "bg-status-amber-dim text-status-amber",
    text: "text-status-amber",
    blurb: "Due within a week — not counting daily duties",
  },
  Scheduled: {
    label: "Scheduled",
    dot: "bg-text-3/40",
    chip: "bg-chip text-text-2",
    text: "text-text-2",
    blurb: "A future date, not due yet",
  },
};

/** Open work — everything that still needs somebody to do something. */
export function isOpen(status: OccurrenceStatus): boolean {
  return status !== "Done";
}
