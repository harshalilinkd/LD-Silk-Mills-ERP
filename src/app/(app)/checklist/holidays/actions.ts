"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { holidays } from "@/db/checklist/schema";
import { requireChecklistAdmin } from "@/lib/checklist/authz";
import { isIsoDate, type IsoDate } from "@/lib/checklist/dates";
import { parseHolidays } from "@/lib/checklist/import-parsers";
import {
  clearScheduledOn,
  completedOn,
  regenerateAll,
} from "@/lib/checklist/occurrences";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Holidays — and what they do to work already scheduled
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A holiday is not just a row in a list. It changes the schedule, and the two
 * directions are NOT symmetrical:
 *
 *   ADDING one    → clears what was scheduled that day, from today onwards,
 *                   and only what is not already done.
 *   REMOVING one  → re-runs generation for every active task, which fills the
 *                   date back in. Existing rows are untouched because
 *                   generation is an upsert that does nothing on conflict.
 *
 * ── WHY "FROM TODAY ONWARDS" ─────────────────────────────────────────────
 *
 * Declaring 26 January a holiday in March must not delete the rows proving
 * people worked on it, nor rewrite whether that work counted as on time.
 * History is a record of what actually happened; a holiday declared afterwards
 * does not change what happened.
 */

const paths = () => {
  revalidatePath("/checklist/holidays");
  revalidatePath("/checklist/master");
  revalidatePath("/checklist");
};

export type AddHolidayResult = {
  /** Rows that were scheduled that day and have now been cleared. */
  cleared: number;
  /** Rows already ticked off that day, which were LEFT ALONE. */
  keptDone: number;
};

export async function createHoliday(
  date: string,
  name: string | null,
): Promise<AddHolidayResult> {
  await requireChecklistAdmin();
  if (!isIsoDate(date)) throw new Error("That date could not be read.");

  const [existing] = await checklistDb
    .select({ id: holidays.id })
    .from(holidays)
    .where(eq(holidays.holidayDate, date))
    .limit(1);
  if (existing) throw new Error("That date is already on the holiday list.");

  await checklistDb
    .insert(holidays)
    .values({ holidayDate: date, name: name?.trim() || null })
    .onConflictDoNothing({ target: holidays.holidayDate });

  const keptDone = await completedOn(date);
  const cleared = await clearScheduledOn(date);

  paths();
  return { cleared, keptDone };
}

export async function updateHoliday(id: number, date: string, name: string | null) {
  await requireChecklistAdmin();
  if (!isIsoDate(date)) throw new Error("That date could not be read.");

  await checklistDb
    .update(holidays)
    .set({ holidayDate: date, name: name?.trim() || null })
    .where(eq(holidays.id, id));

  // The date may have moved, so the new one has to be cleared and the old one
  // refilled. Regenerating everything is the honest way to get both — and it
  // cannot disturb a tick, because generation never overwrites.
  await clearScheduledOn(date);
  await regenerateAll();

  paths();
}

/**
 * Remove a holiday and put the work back.
 *
 * The count returned is how many dates were re-created, which is the number
 * worth showing: "13 tasks are now due again" is what somebody undoing a
 * mistaken holiday needs to see.
 */
export async function deleteHoliday(id: number): Promise<{ restored: number }> {
  await requireChecklistAdmin();
  await checklistDb.delete(holidays).where(eq(holidays.id, id));
  const { added } = await regenerateAll();
  paths();
  return { restored: added };
}

/**
 * Bulk import.
 *
 * Re-parsed here from the raw text, against a freshly-read list of dates —
 * the browser preview is a courtesy, never the check.
 *
 * The clearing pass runs per date AFTER every insert, sequentially. The pool
 * holds five connections and a year's holiday list is a dozen rows; firing
 * them together is the pipelined-statement stall this codebase has hit before.
 */
export async function importHolidays(text: string) {
  await requireChecklistAdmin();

  const existing = await checklistDb
    .select({ d: holidays.holidayDate })
    .from(holidays);
  const rows = parseHolidays(text, new Set(existing.map((r) => r.d)));

  const toAdd = rows.flatMap((r) => (r.verdict === "add" && r.value ? [r.value] : []));

  let added = 0;
  if (toAdd.length > 0) {
    const written = await checklistDb
      .insert(holidays)
      .values(toAdd.map((h) => ({ holidayDate: h.date, name: h.name })))
      .onConflictDoNothing({ target: holidays.holidayDate })
      .returning({ d: holidays.holidayDate });
    added = written.length;

    for (const row of written) await clearScheduledOn(row.d as IsoDate);
  }

  paths();
  return {
    added,
    skipped: rows.filter((r) => r.verdict === "skip").length + (toAdd.length - added),
    failed: rows.filter((r) => r.verdict === "error").length,
  };
}
