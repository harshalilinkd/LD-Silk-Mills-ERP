import "server-only";

import { and, eq, gte, inArray, isNull, ne, sql as raw } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, holidays, occurrences, tasks } from "@/db/checklist/schema";
import { generationWindow, todayIso, weekdayOf, type IsoDate } from "./dates";
import { recurrenceDates, type Frequency } from "./frequency";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Turning a standing duty into dated rows people can tick
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything that writes to `occurrences` goes through this file. It is the
 * only place that decides what a task's schedule IS, so there is one answer to
 * that question rather than one per screen.
 *
 * ── THE RULE THAT PROTECTS COMPLETED WORK ────────────────────────────────
 *
 * Generation is an UPSERT that does nothing on conflict, keyed on
 * `{taskId}_{plannedDate}`. Re-running it is therefore always safe: a row
 * somebody already ticked is left exactly as it was. Every operation below —
 * creating a task, editing one, adding a holiday, rolling the year forward —
 * re-runs the same generation rather than deleting and rebuilding, because a
 * tick is the record that the work was done and nothing here may erase it.
 *
 * Where rows genuinely must go — a holiday declared on a date already
 * scheduled, a task edited to start later — the delete is narrowed with
 * `status <> 'Done'` in the SQL itself. Not filtered in JavaScript afterwards:
 * the guard has to be in the statement, or a bug between the read and the
 * delete quietly takes finished work with it.
 */

/** Sundays are excluded by rule, so nobody has to enter fifty-two rows a year. */
const SUNDAY = 0;

/** The extra non-working days, as a set of `YYYY-MM-DD`. */
export async function holidaySet(): Promise<Set<IsoDate>> {
  const rows = await checklistDb
    .select({ d: holidays.holidayDate })
    .from(holidays);
  return new Set(rows.map((r) => r.d));
}

/**
 * The working days a task falls on, inside the financial year.
 *
 * Three filters, in this order and for this reason: the recurrence says when
 * it is due; the task's own end date stops it; the financial year clamps it.
 * Sundays and holidays are removed LAST, so a duty that lands on Diwali is
 * simply not due that year rather than being pushed to the next day — a
 * holiday is a day off, not a day moved.
 */
export function plannedDatesFor(
  task: { frequency: Frequency; startDate: IsoDate; endDate: IsoDate | null },
  offDays: Set<IsoDate>,
  window = generationWindow(),
): IsoDate[] {
  const to = task.endDate && task.endDate < window.to ? task.endDate : window.to;
  return recurrenceDates(task.frequency, task.startDate, window.from, to).filter(
    (d) => weekdayOf(d) !== SUNDAY && !offDays.has(d),
  );
}

type TaskRow = {
  id: number;
  name: string;
  doerId: number;
  frequency: Frequency;
  startDate: IsoDate;
  endDate: IsoDate | null;
  active: boolean;
};

/**
 * Write one task's schedule. Returns how many NEW dates were added.
 *
 * An inactive task generates nothing and its existing rows are left alone —
 * turning a duty off should not erase the record of the times it was done.
 */
export async function generateForTask(
  task: TaskRow,
  offDays?: Set<IsoDate>,
): Promise<number> {
  if (!task.active) return 0;
  const off = offDays ?? (await holidaySet());
  const dates = plannedDatesFor(task, off);
  if (dates.length === 0) return 0;

  let written = 0;
  // Chunked because a daily task is ~300 rows and postgres.js builds one
  // parameter per column per row. Well inside any limit, but a single
  // statement of several thousand parameters is a stall waiting to happen on
  // the transaction pooler.
  const CHUNK = 250;
  for (let i = 0; i < dates.length; i += CHUNK) {
    const slice = dates.slice(i, i + CHUNK);
    const result = await checklistDb
      .insert(occurrences)
      .values(
        slice.map((plannedDate) => ({
          occurrenceKey: `${task.id}_${plannedDate}`,
          taskId: task.id,
          doerId: task.doerId,
          taskName: task.name,
          frequency: task.frequency,
          plannedDate,
          status: "Scheduled" as const,
        })),
      )
      // The whole safety property of this module, in one line.
      .onConflictDoNothing({ target: occurrences.occurrenceKey })
      .returning({ id: occurrences.id });
    written += result.length;
  }
  return written;
}

/**
 * Re-issue a task's schedule after its definition changed.
 *
 * Editing a task can only mean one of two things for a date that is no longer
 * due: it was never done, in which case it should go; or it WAS done, in which
 * case it is history and stays. Hence the `ne(status, 'Done')` in the delete —
 * and hence `>= today`, because rearranging a duty today says nothing about
 * what was or was not required last month.
 */
export async function regenerateTask(task: TaskRow): Promise<{ added: number; removed: number }> {
  const off = await holidaySet();
  const keep = new Set(task.active ? plannedDatesFor(task, off) : []);
  const today = todayIso();

  const stale = await checklistDb
    .select({ id: occurrences.id, plannedDate: occurrences.plannedDate })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.taskId, task.id),
        ne(occurrences.status, "Done"),
        gte(occurrences.plannedDate, today),
      ),
    );

  const doomed = stale.filter((r) => !keep.has(r.plannedDate)).map((r) => r.id);
  let removed = 0;
  if (doomed.length > 0) {
    const gone = await checklistDb
      .delete(occurrences)
      .where(
        and(
          inArray(occurrences.id, doomed),
          // Repeated deliberately. The ids came from a SELECT a moment ago;
          // between the two, somebody may have ticked one of them off.
          ne(occurrences.status, "Done"),
        ),
      )
      .returning({ id: occurrences.id });
    removed = gone.length;
  }

  // The snapshot columns ride along with the definition, so a renamed task
  // reads correctly on rows that already exist. Only rows still to come: a
  // completed row records what was done at the time, under the name it had.
  await checklistDb
    .update(occurrences)
    .set({ taskName: task.name, doerId: task.doerId, frequency: task.frequency, updatedAt: new Date() })
    .where(
      and(
        eq(occurrences.taskId, task.id),
        ne(occurrences.status, "Done"),
      ),
    );

  const added = await generateForTask(task, off);
  return { added, removed };
}

/**
 * Re-issue EVERY active task. Used after a holiday is removed, and by the
 * "Rebuild schedule" button when the financial year rolls over.
 *
 * Sequential on purpose. The pool is capped at five connections and this can
 * be a hundred tasks — firing them together is the pipelined-statement stall
 * documented at length in `src/db/index.ts`.
 */
export async function regenerateAll(): Promise<{ tasks: number; added: number }> {
  const off = await holidaySet();
  // Four conditions, and the last two are the ones that were missing: a task
  // belonging to somebody deactivated or deleted must stop generating, or
  // "Rebuild schedule" would quietly put their work back every time it ran.
  const rows = await checklistDb
    .select({
      id: tasks.id,
      name: tasks.name,
      doerId: tasks.doerId,
      frequency: tasks.frequency,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      active: tasks.active,
    })
    .from(tasks)
    .innerJoin(doers, eq(doers.id, tasks.doerId))
    .where(
      and(
        eq(tasks.active, true),
        isNull(tasks.deletedAt),
        eq(doers.active, true),
        isNull(doers.deletedAt),
      ),
    );

  let added = 0;
  for (const t of rows) added += await generateForTask(t as TaskRow, off);
  return { tasks: rows.length, added };
}

/**
 * A day was declared a holiday. Clear what was scheduled on it.
 *
 * Only what is NOT done, and only from today onwards. Declaring 26 January a
 * holiday in March must not delete the row proving somebody did the job on it,
 * nor rewrite whether last year's work counted.
 */
export async function clearScheduledOn(date: IsoDate): Promise<number> {
  const today = todayIso();
  if (date < today) return 0;
  const gone = await checklistDb
    .delete(occurrences)
    .where(
      and(
        eq(occurrences.plannedDate, date),
        ne(occurrences.status, "Done"),
      ),
    )
    .returning({ id: occurrences.id });
  return gone.length;
}

/** Count of rows on a date that are already ticked — a holiday cannot remove these. */
export async function completedOn(date: IsoDate): Promise<number> {
  const [row] = await checklistDb
    .select({ n: raw<number>`count(*)::int` })
    .from(occurrences)
    .where(and(eq(occurrences.plannedDate, date), eq(occurrences.status, "Done")));
  return row?.n ?? 0;
}
