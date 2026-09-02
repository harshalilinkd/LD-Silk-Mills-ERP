/**
 * The numbers behind the employee dashboard's sparklines.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT THESE LINES ACTUALLY PLOT, AND WHAT THEY DO NOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every sparkline is the CUMULATIVE COUNT of that bucket's concerns by the day
 * they were FILED, over the last fourteen days. It is not the bucket's history.
 *
 * That distinction matters and it is not a shortcut anyone can code around.
 * The dashboard's one query reads `v_concerns`, which carries a concern's
 * CURRENT status and nothing about when it got there. "How many were open last
 * Tuesday" is genuinely unanswerable from this data — it would need the
 * `concern_updates` timeline, which is a second query per card and a join this
 * screen does not make.
 *
 * So the honest reading of the Open card's line is: "of the concerns that are
 * open right now, this is when they arrived." That is a real, useful shape — a
 * steep recent rise means a pile-up this week — and it comes from real rows,
 * which is the part that matters.
 *
 * THE LINE ALWAYS ENDS AT THE CARD'S NUMBER. That is what makes the figure and
 * the shape read as one object rather than two facts sharing a card, and it is
 * why both are derived from the same bucket definitions. A line that does not
 * end at its own number is worse than no line at all: it implies a
 * relationship that is not there.
 *
 * Zero extra requests: computed from the set the dashboard already holds.
 */

/** Two weeks. Long enough to show a shape, short enough to read at 88px. */
export const SERIES_DAYS = 14;

const DAY_MS = 86_400_000;

/** Whole calendar days between two instants, local time. */
function calendarDaysBetween(later: Date, earlier: Date): number {
  const a = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  const b = new Date(
    earlier.getFullYear(),
    earlier.getMonth(),
    earlier.getDate(),
  );
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/**
 * @param isoDates Filing timestamps, any order.
 * @param days     Window length; the last entry is always today.
 * @param now      Injectable so this is testable without freezing the clock.
 * @returns        `days` running totals, oldest first.
 */
export function cumulativeByDay(
  isoDates: string[],
  days: number = SERIES_DAYS,
  now: Date = new Date(),
): number[] {
  const perDay = new Array<number>(days).fill(0);

  // Everything filed BEFORE the window opened. Without this the line starts at
  // zero and implies the person joined the company a fortnight ago — and worse,
  // the last point would no longer match the card's number, which is the one
  // thing that must always be true.
  let carried = 0;

  for (const iso of isoDates) {
    const filed = new Date(iso);
    if (Number.isNaN(filed.getTime())) continue; // dropped, not zeroed

    const age = calendarDaysBetween(now, filed);
    if (age >= days) {
      carried += 1;
      continue;
    }
    // A future-dated row (clock skew between a phone and Postgres) lands on
    // today rather than off the end of the array.
    const index = age < 0 ? days - 1 : days - 1 - age;
    perDay[index] = (perDay[index] ?? 0) + 1;
  }

  let running = carried;
  return perDay.map((n) => {
    running += n;
    return running;
  });
}
