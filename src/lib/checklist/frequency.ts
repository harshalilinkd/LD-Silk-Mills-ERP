import {
  addDays,
  addMonths,
  daysInMonth,
  endOfMonth,
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  startOfMonth,
  weekdayOf,
  type IsoDate,
} from "./dates";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How often a duty comes round, and which days that lands on
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The twelve codes are the original's, verbatim, so anybody who has used the
 * Linkd Prints system reads the same letters here. The screens print the code
 * in the narrow "FREQ" column and the plain-English label everywhere there is
 * room — a column header reading "D" is fine when the row beside it says
 * "Every working day" in the dropdown that set it.
 *
 * NO SERVER IMPORTS. The task form is a client component and needs the labels;
 * the generator on the server needs the dates. Both live here because they are
 * the same knowledge, and splitting them is how the two drift apart.
 */

export const FREQUENCIES = [
  "D", "W", "F", "M", "Q", "Y", "SM", "E1ST", "E2ND", "E3RD", "E4TH", "ELAST",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
}

/**
 * What each code means, in words somebody can choose from a dropdown without
 * being told what "F" stands for.
 *
 * `weekdayFromStart` marks the five that take their WEEKDAY from the task's
 * start date rather than a fixed day — the form warns about it, because "every
 * 2nd Tuesday" starting on a Thursday is a mistake nobody spots later.
 */
export const FREQUENCY_META: Record<
  Frequency,
  { label: string; help: string; weekdayFromStart?: boolean }
> = {
  D: { label: "Daily", help: "Every working day" },
  W: { label: "Weekly", help: "Same weekday, every 7 days" },
  F: { label: "Fortnightly", help: "Same weekday, every 14 days" },
  M: { label: "Monthly", help: "Same date each month" },
  Q: { label: "Quarterly", help: "Same date, every 3 months" },
  Y: { label: "Yearly", help: "Same date, once a year" },
  SM: { label: "Twice a month", help: "The 1st and the 15th" },
  E1ST: { label: "Every 1st …day", help: "1st of that weekday each month", weekdayFromStart: true },
  E2ND: { label: "Every 2nd …day", help: "2nd of that weekday each month", weekdayFromStart: true },
  E3RD: { label: "Every 3rd …day", help: "3rd of that weekday each month", weekdayFromStart: true },
  E4TH: { label: "Every 4th …day", help: "4th of that weekday each month", weekdayFromStart: true },
  ELAST: { label: "Every last …day", help: "Last of that weekday each month", weekdayFromStart: true },
};

/** "Every 2nd Tuesday" — the label with the weekday filled in from a start date. */
export function frequencyLabelFor(freq: Frequency, startDate?: IsoDate | null): string {
  const meta = FREQUENCY_META[freq];
  if (!meta.weekdayFromStart || !startDate) return meta.label;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = names[weekdayOf(startDate)];
  // Typed as a partial lookup: only the five weekday-anchored codes reach
  // here, but the compiler sees the whole union and would reject a total map.
  const ordinals: Partial<Record<Frequency, string>> = {
    E1ST: "1st",
    E2ND: "2nd",
    E3RD: "3rd",
    E4TH: "4th",
    ELAST: "last",
  };
  return `Every ${ordinals[freq] ?? ""} ${day}`.replace("  ", " ");
}

// ─── the recurrence itself ────────────────────────────────────────────────

/**
 * Every date this frequency lands on between `from` and `to`, inclusive.
 *
 * **Sundays and holidays are NOT removed here.** This answers "when is it
 * due?"; `src/lib/checklist/occurrences.ts` answers "which of those are
 * working days?". Keeping them apart means the calendar rule can be tested
 * without a holiday table, and — the part that actually matters — a monthly
 * duty whose date falls on Diwali is DROPPED rather than silently shunted to
 * the 2nd, which is what the original does and what the owner's team expects:
 * a holiday is a day off, not a day moved.
 *
 * `start` is the anchor for the arithmetic even when `from` is later: a
 * monthly task takes its day-of-month from the start date, and an "every 2nd
 * Tuesday" takes its weekday from there. Clipping the OUTPUT to a window is
 * not the same as restarting the series inside it.
 */
export function recurrenceDates(
  freq: Frequency,
  start: IsoDate,
  from: IsoDate,
  to: IsoDate,
): IsoDate[] {
  const out: IsoDate[] = [];
  // Nothing before the anchor, ever — a task cannot be due before it begins.
  const lower = start > from ? start : from;
  if (lower > to) return out;

  const push = (d: IsoDate) => {
    if (d >= lower && d <= to) out.push(d);
  };

  switch (freq) {
    case "D":
    case "W":
    case "F": {
      const step = freq === "D" ? 1 : freq === "W" ? 7 : 14;
      // Jump straight to the first hit at or after `lower` instead of walking
      // from the start date. A daily task anchored two years back would
      // otherwise loop seven hundred times to produce one month of dates.
      let d = start;
      if (d < lower) {
        const gap = Math.ceil(daysBetweenSafe(start, lower) / step);
        d = addDays(start, gap * step);
      }
      for (; d <= to; d = addDays(d, step)) push(d);
      break;
    }

    case "M":
    case "Q":
    case "Y": {
      const step = freq === "M" ? 1 : freq === "Q" ? 3 : 12;
      const targetDay = Number(start.slice(8, 10));
      // Walk months from the anchor. `addMonths` clamps, so the 31st becomes
      // the 28th in February — but the NEXT month must come from the anchor's
      // day again, not from the clamped one, or a task set on the 31st walks
      // itself down to the 28th for the rest of its life.
      let cursor = startOfMonth(start);
      const guardTo = endOfMonth(to);
      while (cursor <= guardTo) {
        const [y, m] = cursor.split("-").map(Number);
        const day = Math.min(targetDay, daysInMonth(y, m - 1));
        push(`${cursor.slice(0, 7)}-${String(day).padStart(2, "0")}`);
        cursor = addMonths(cursor, step);
      }
      break;
    }

    case "SM": {
      let cursor = startOfMonth(start);
      const guardTo = endOfMonth(to);
      while (cursor <= guardTo) {
        push(`${cursor.slice(0, 7)}-01`);
        push(`${cursor.slice(0, 7)}-15`);
        cursor = addMonths(cursor, 1);
      }
      break;
    }

    case "E1ST":
    case "E2ND":
    case "E3RD":
    case "E4TH": {
      const n = { E1ST: 1, E2ND: 2, E3RD: 3, E4TH: 4 }[freq];
      const weekday = weekdayOf(start);
      let cursor = startOfMonth(start);
      const guardTo = endOfMonth(to);
      while (cursor <= guardTo) {
        const [y, m] = cursor.split("-").map(Number);
        const hit = nthWeekdayOfMonth(y, m - 1, weekday, n);
        if (hit) push(hit);
        cursor = addMonths(cursor, 1);
      }
      break;
    }

    case "ELAST": {
      const weekday = weekdayOf(start);
      let cursor = startOfMonth(start);
      const guardTo = endOfMonth(to);
      while (cursor <= guardTo) {
        const [y, m] = cursor.split("-").map(Number);
        push(lastWeekdayOfMonth(y, m - 1, weekday));
        cursor = addMonths(cursor, 1);
      }
      break;
    }
  }

  return out;
}

/** Local copy so this module keeps its single import surface. */
function daysBetweenSafe(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}
