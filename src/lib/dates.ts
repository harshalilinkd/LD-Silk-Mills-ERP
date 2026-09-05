/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dates, as dates — no clocks, no timezones, no Date objects in the middle
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything in this module is a `YYYY-MM-DD` STRING. A planned date is a day
 * on a calendar, not an instant: "check the register on the 5th" is true all
 * day in Bhiwandi and does not become the 4th because a server in Virginia
 * thinks it is still yesterday evening.
 *
 * ── WHY NOT `date-fns`, WHICH THE ORIGINAL USES ──────────────────────────
 *
 * Two reasons, and the second is a bug.
 *
 *   1. It is a dependency this repo does not have, for arithmetic that comes
 *      to about eighty lines.
 *   2. The original calls `parseISO('2026-04-01')`, which yields LOCAL
 *      midnight, then `.getDay()` on it. Run that anywhere east of UTC and
 *      local midnight is still the previous day in UTC — every weekday
 *      calculation, every Sunday exclusion and every "nth Tuesday" silently
 *      shifts by one. It happens not to bite them because their server is set
 *      to Asia/Kolkata. Ours runs wherever Vercel puts it.
 *
 * So the arithmetic here is done in UTC throughout and converted back to a
 * string immediately. `Date` never escapes a function in this file.
 *
 * NO IMPORTS AT ALL — a client component may use every one of these.
 *
 * ── WHY THIS IS SHARED AND NOT PER-MODULE ────────────────────────────────
 *
 * It began inside the Checklist. Petty Cash needs the same answers — today in
 * Bhiwandi, a month's first and last day, a date somebody can read — and two
 * copies of `todayIso()` is two answers to what day it is, which is exactly
 * the class of bug this file exists to prevent. `lib/checklist/dates.ts`
 * re-exports it, so nothing that already imported it had to change.
 */

/** A calendar day, `YYYY-MM-DD`. Not an instant. */
export type IsoDate = string;

const DAY_MS = 86_400_000;

/** True for a well-formed `YYYY-MM-DD` that is also a real calendar date. */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // 2026-02-30 passes the regex. Round-tripping catches it: JS rolls the
  // overflow into March and the string comes back different.
  return toIso(fromIso(value)) === value;
}

/** `YYYY-MM-DD` → a UTC-midnight Date. Internal; never returned to callers. */
function fromIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: IsoDate): number {
  return fromIso(iso).getUTCDay();
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return toIso(new Date(fromIso(iso).getTime() + n * DAY_MS));
}

/**
 * Whole days between two calendar dates. Positive when `b` is later.
 *
 * Exact because both sides are UTC midnight: no daylight-saving hour can make
 * a day 23 or 25 hours long and round the answer wrong.
 */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY_MS);
}

/**
 * Add whole months, clamping to the end of a short month.
 *
 * The 31st plus one month is the 28th of February, not the 3rd of March. A
 * monthly duty set on the 31st should land on the last day of every month,
 * which is what somebody means when they say "the 31st" about February.
 */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const d = fromIso(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = Math.min(d.getUTCDate(), daysInMonth(y, m));
  return toIso(new Date(Date.UTC(y, m, day)));
}

/** `monthIdx` may be out of range — JS normalises the year for us. */
export function daysInMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const d = fromIso(iso);
  return toIso(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), daysInMonth(d.getUTCFullYear(), d.getUTCMonth()))),
  );
}

/** The `n`th given weekday of a month, or null if the month has no such week. */
export function nthWeekdayOfMonth(
  year: number,
  monthIdx: number,
  weekday: number,
  n: number,
): IsoDate | null {
  const first = new Date(Date.UTC(year, monthIdx, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  if (day > daysInMonth(year, monthIdx)) return null;
  return toIso(new Date(Date.UTC(year, monthIdx, day)));
}

/** The LAST given weekday of a month. Always exists. */
export function lastWeekdayOfMonth(year: number, monthIdx: number, weekday: number): IsoDate {
  const lastDay = daysInMonth(year, monthIdx);
  const last = new Date(Date.UTC(year, monthIdx, lastDay));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return toIso(new Date(Date.UTC(year, monthIdx, lastDay - offset)));
}

// ─── today, where the business actually is ────────────────────────────────

/**
 * Today's date in Asia/Kolkata, whatever the server thinks it is.
 *
 * This matters more than it looks. Between 18:30 and 24:00 UTC it is already
 * tomorrow in India, and a server computing "today" in UTC would show the
 * whole evening shift a checklist for the wrong day and mark their work late.
 * IST has no daylight saving, so the fixed +5:30 is exact and permanent.
 */
export function todayIso(): IsoDate {
  return toIso(new Date(Date.now() + 5.5 * 60 * 60 * 1000));
}

// ─── the financial year ───────────────────────────────────────────────────

/**
 * The financial year runs 1 April to 31 March — confirmed by the owner for LD
 * Silk Mills, and the same window the Linkd Prints system uses.
 *
 * It is COMPUTED from a date rather than hard-coded, which is the one thing
 * the original got wrong here: theirs pins `FY_START=2026-04-01` in an
 * environment variable, so on the 1st of April 2027 the whole system quietly
 * stops generating anything until somebody remembers to edit it. This rolls
 * over on its own.
 */
export const FY_START_MONTH = 3; // April, zero-based

export function financialYearOf(iso: IsoDate): { from: IsoDate; to: IsoDate; label: string } {
  const d = fromIso(iso);
  const y = d.getUTCFullYear();
  // Jan–Mar belong to the financial year that began the previous April.
  const startYear = d.getUTCMonth() >= FY_START_MONTH ? y : y - 1;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: `${startYear}–${String(startYear + 1).slice(2)}`,
  };
}

/** The window occurrences are generated into: the financial year containing today. */
export function generationWindow(): { from: IsoDate; to: IsoDate; label: string } {
  return financialYearOf(todayIso());
}

// ─── display ──────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** `05/09/2026` — the format every screen in the original prints. */
export function formatDate(iso: IsoDate | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** `5 Sep 2026` — for prose, where slashes read as noise. */
export function formatDateLong(iso: IsoDate | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function weekdayName(iso: IsoDate): string {
  return WEEKDAYS[weekdayOf(iso)];
}

export function monthLabel(iso: IsoDate): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
