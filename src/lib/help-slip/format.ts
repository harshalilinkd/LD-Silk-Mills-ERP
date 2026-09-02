import type { HelpSlipLocale } from "./meta";

/**
 * Dates, times and greetings for Help Slip.
 *
 * The source app does this with `date-fns` + `date-fns/locale`. We are under a
 * no-new-dependencies rule, and every function it used has an `Intl` answer
 * that ships with the runtime — `RelativeTimeFormat` even gives us Hindi
 * ("2 दिन पहले") for free, which a hand-rolled English-only string could not.
 */

/** Everything is displayed in the factory's own time. */
export const APP_TIME_ZONE = "Asia/Kolkata";

const INTL_LOCALE: Record<HelpSlipLocale, string> = {
  en: "en-GB",
  hi: "hi-IN",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "2 days ago". Relative reads faster than a date for anything recent, but it
 * must not be the ONLY form past a week — nobody can hold "43 days ago" as a
 * date — so beyond 7 days this falls back to an absolute one.
 */
export function relativeTime(
  iso: string | null | undefined,
  locale: HelpSlipLocale = "en",
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const ageMs = Date.now() - date.getTime();
  if (ageMs > WEEK) return shortDate(date, locale);

  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], {
    numeric: "auto",
  });

  // Future timestamps are possible (clock skew between a phone and Postgres),
  // so the sign is carried through rather than clamped to zero.
  const abs = Math.abs(ageMs);
  const sign = ageMs >= 0 ? -1 : 1;

  if (abs < MINUTE) return rtf.format(sign * Math.round(abs / 1000), "second");
  if (abs < HOUR) return rtf.format(sign * Math.round(abs / MINUTE), "minute");
  if (abs < DAY) return rtf.format(sign * Math.round(abs / HOUR), "hour");
  return rtf.format(sign * Math.round(abs / DAY), "day");
}

/** "4 Aug 2026". For a date somebody PICKED, which has no time of day. */
export function shortDate(
  date: Date,
  locale: HelpSlipLocale = "en",
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Absolute, for the `title` on a relative age. "4 Aug 2026, 16:20". */
export function absoluteTime(
  iso: string | null | undefined,
  locale: HelpSlipLocale = "en",
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "d MMM" — the compact form the insights charts label their axis ends with. */
export function dayLabel(iso: string, locale: HelpSlipLocale = "en"): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
  }).format(date);
}

/**
 * A calendar day as `yyyy-MM-dd`, in LOCAL time.
 *
 * Deliberately NOT `toISOString().slice(0, 10)`: that converts to UTC first,
 * so any evening in Asia/Kolkata (UTC+5:30) comes back as the following day
 * and a date filter quietly excludes the day the user actually tapped.
 */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** `n` days before `from`, as a day key. Negative `n` moves forward. */
export function dayKeyMinus(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

export function startOfMonthKey(from: Date = new Date()): string {
  return dayKey(new Date(from.getFullYear(), from.getMonth(), 1));
}

/** Is this timestamp on today's LOCAL calendar day? Drives Today / Earlier. */
export function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * The hour in Asia/Kolkata, regardless of where the device thinks it is.
 *
 * `Intl` rather than a timezone package: this is the only place the module
 * needs a zone-aware hour and it is not worth a dependency.
 */
export function hourInAppZone(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

export type Greeting = { en: string; hi: string };

const GREETINGS = {
  morning: { en: "Good morning", hi: "सुप्रभात" },
  afternoon: { en: "Good afternoon", hi: "नमस्कार" },
  evening: { en: "Good evening", hi: "शुभ संध्या" },
} as const;

export function greetingFor(now: Date = new Date()): Greeting {
  const hour = hourInAppZone(now);
  if (hour < 12) return GREETINGS.morning;
  if (hour < 17) return GREETINGS.afternoon;
  return GREETINGS.evening;
}

/**
 * The department name a row should print.
 *
 * `department_name` is a FILING-TIME SNAPSHOT and is nullable in the view. In
 * the source app the table cell and the mobile card each resolved it inline
 * and neither had a fallback, so a null snapshot rendered as a blank cell —
 * indistinguishable from a loading glitch. Every "nothing to show" value in
 * this module prints an em dash instead, and it does it from one place.
 */
export function departmentOf(
  row: { departmentName: string | null; departmentNameHi: string | null },
  locale: HelpSlipLocale,
): string {
  const name =
    locale === "hi" && row.departmentNameHi
      ? row.departmentNameHi
      : row.departmentName;
  return name ?? "—";
}

/**
 * "3d" / "4h" — the coordinator's scan value for how long a concern has sat.
 * A relative age is what gets scanned; the absolute one goes in the `title`.
 */
export function shortAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const hours = Math.floor(ms / HOUR);
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${Math.max(hours, 0)}h`;
}
