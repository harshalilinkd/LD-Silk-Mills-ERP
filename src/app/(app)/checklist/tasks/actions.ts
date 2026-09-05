"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, occurrences, tasks } from "@/db/checklist/schema";
import { requireChecklistAdmin } from "@/lib/checklist/authz";
import { generationWindow, isIsoDate } from "@/lib/checklist/dates";
import { isFrequency, type Frequency } from "@/lib/checklist/frequency";
import { parseTasks } from "@/lib/checklist/import-parsers";
import {
  generateForTask,
  holidaySet,
  regenerateAll,
  regenerateTask,
} from "@/lib/checklist/occurrences";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Tasks — writes, and the schedule that follows from them
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every write here has a second half: the dated rows people actually tick.
 * Creating a task generates them, editing one re-issues them, and neither can
 * touch a row already ticked off — the guard for that lives in
 * `lib/checklist/occurrences.ts` and is a condition in the SQL rather than a
 * filter applied afterwards.
 *
 * These are the slowest actions in the module and that is inherent: a daily
 * duty is about two hundred rows for the year, and "assign to everybody" times
 * that by the size of the company. They are written sequentially on purpose —
 * the pool holds five connections and firing thirty inserts at once is the
 * pipelined-statement stall documented in `src/db/index.ts`, which does not
 * fail, it hangs.
 */

const paths = () => {
  revalidatePath("/checklist/tasks");
  revalidatePath("/checklist/master");
  revalidatePath("/checklist/scorecards");
  revalidatePath("/checklist");
};

export type TaskInput = {
  name: string;
  doerId: number;
  frequency: string;
  startDate: string;
  endDate: string | null;
  assignedBy: string | null;
  notes: string | null;
  active: boolean;
};

function validate(input: TaskInput): {
  name: string;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
} {
  const name = input.name.trim();
  if (!name) throw new Error("The task needs a name.");
  if (name.length > 300) throw new Error("That task name is too long.");
  if (!isFrequency(input.frequency)) throw new Error("Pick how often it repeats.");
  if (!isIsoDate(input.startDate)) throw new Error("The start date could not be read.");
  if (input.endDate && !isIsoDate(input.endDate)) {
    throw new Error("The end date could not be read.");
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error("The end date is before the start date.");
  }
  return {
    name,
    frequency: input.frequency,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export async function createTask(input: TaskInput): Promise<{ id: number; scheduled: number }> {
  await requireChecklistAdmin();
  const v = validate(input);

  const [doer] = await checklistDb
    .select({ id: doers.id, active: doers.active })
    .from(doers)
    .where(eq(doers.id, input.doerId))
    .limit(1);
  if (!doer) throw new Error("That person is not on the doers list.");

  const [row] = await checklistDb
    .insert(tasks)
    .values({
      name: v.name,
      doerId: input.doerId,
      frequency: v.frequency,
      startDate: v.startDate,
      endDate: v.endDate,
      assignedBy: input.assignedBy?.trim() || null,
      notes: input.notes?.trim() || null,
      active: input.active,
    })
    .returning({ id: tasks.id });

  const scheduled = await generateForTask({
    id: row.id,
    name: v.name,
    doerId: input.doerId,
    frequency: v.frequency,
    startDate: v.startDate,
    endDate: v.endDate,
    active: input.active,
  });

  paths();
  return { id: row.id, scheduled };
}

/**
 * The same duty, given to everybody at once.
 *
 * Their dialog offers this and it is genuinely useful — "attend the morning
 * meeting" belongs to all thirty people. Only ACTIVE doers get it: handing a
 * standing duty to somebody who has left is not what "everybody" means.
 */
export async function createTaskForAll(
  input: Omit<TaskInput, "doerId">,
): Promise<{ created: number; scheduled: number }> {
  await requireChecklistAdmin();
  const v = validate(input as TaskInput);

  const people = await checklistDb
    .select({ id: doers.id })
    .from(doers)
    .where(eq(doers.active, true));

  if (people.length === 0) throw new Error("There are no active doers to assign it to.");

  // Read once, reuse for every person. Otherwise this queries the holiday
  // table thirty times to get thirty identical answers.
  const off = await holidaySet();

  let scheduled = 0;
  for (const p of people) {
    const [row] = await checklistDb
      .insert(tasks)
      .values({
        name: v.name,
        doerId: p.id,
        frequency: v.frequency,
        startDate: v.startDate,
        endDate: v.endDate,
        assignedBy: input.assignedBy?.trim() || null,
        notes: input.notes?.trim() || null,
        active: input.active,
      })
      .returning({ id: tasks.id });

    scheduled += await generateForTask(
      {
        id: row.id,
        name: v.name,
        doerId: p.id,
        frequency: v.frequency,
        startDate: v.startDate,
        endDate: v.endDate,
        active: input.active,
      },
      off,
    );
  }

  paths();
  return { created: people.length, scheduled };
}

/**
 * Edit a task, then re-issue its schedule.
 *
 * `regenerateTask` removes future dates that no longer apply, updates the
 * snapshot on future rows so a rename reads correctly, and adds whatever is
 * newly due. It cannot remove a completed row — the delete carries
 * `status <> 'Done'` in the statement itself.
 */
export async function updateTask(
  id: number,
  input: TaskInput,
): Promise<{ added: number; removed: number }> {
  await requireChecklistAdmin();
  const v = validate(input);

  const [doer] = await checklistDb
    .select({ id: doers.id })
    .from(doers)
    .where(eq(doers.id, input.doerId))
    .limit(1);
  if (!doer) throw new Error("That person is not on the doers list.");

  await checklistDb
    .update(tasks)
    .set({
      name: v.name,
      doerId: input.doerId,
      frequency: v.frequency,
      startDate: v.startDate,
      endDate: v.endDate,
      assignedBy: input.assignedBy?.trim() || null,
      notes: input.notes?.trim() || null,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));

  const result = await regenerateTask({
    id,
    name: v.name,
    doerId: input.doerId,
    frequency: v.frequency,
    startDate: v.startDate,
    endDate: v.endDate,
    active: input.active,
  });

  paths();
  return result;
}

/**
 * Delete a task — refused once any of it has been done.
 *
 * The foreign key cascades, so deleting a task with history would take a
 * year of completed rows with it, silently, and every scorecard would change.
 * A task nobody has ticked yet is a mistake somebody is undoing; a task with
 * ticks against it is a record, and the honest way to stop it is to mark it
 * inactive, which keeps the history and stops new dates being generated.
 */
export async function deleteTask(id: number): Promise<void> {
  await requireChecklistAdmin();

  const [{ n }] = await checklistDb
    .select({ n: sql<number>`count(*)::int` })
    .from(occurrences)
    .where(and(eq(occurrences.taskId, id), eq(occurrences.status, "Done")));

  if (n > 0) {
    throw new Error(
      `This task has been ticked off ${n} time${n === 1 ? "" : "s"}. Deleting it would erase that record — set it to Inactive instead, which stops new dates being scheduled and keeps the history.`,
    );
  }

  await checklistDb.delete(tasks).where(eq(tasks.id, id));
  paths();
}

/**
 * Rebuild every active task's schedule.
 *
 * Two jobs, both of which are ordinary rather than emergency repairs: rolling
 * the financial year forward on the 1st of April, and filling in dates after
 * the holiday list has been edited directly. Safe to press at any time — it
 * only ever ADDS dates that are missing.
 */
export async function rebuildSchedule(): Promise<{ tasks: number; added: number; window: string }> {
  await requireChecklistAdmin();
  const { tasks: n, added } = await regenerateAll();
  paths();
  return { tasks: n, added, window: generationWindow().label };
}

/**
 * Bulk import.
 *
 * Re-parsed from the raw text on the server, against freshly-read doers and a
 * freshly-read list of what is already assigned. Generation runs per task and
 * sequentially, for the reason in the header — a thousand-row task sheet is
 * two hundred thousand dated rows, and this is the one action in the module
 * that genuinely takes a while.
 */
export async function importTasks(text: string) {
  await requireChecklistAdmin();

  const people = await checklistDb
    .select({ id: doers.id, email: doers.email })
    .from(doers)
    .where(eq(doers.active, true));
  const idByEmail = new Map(people.map((p) => [p.email, p.id]));

  const existing = await checklistDb
    .select({ name: tasks.name, doerId: tasks.doerId })
    .from(tasks);
  const emailById = new Map(people.map((p) => [p.id, p.email]));
  const existingKeys = new Set(
    existing.map((t) => `${t.name.toLowerCase()}|${emailById.get(t.doerId) ?? t.doerId}`),
  );

  const rows = parseTasks(
    text,
    new Set(idByEmail.keys()),
    existingKeys,
    generationWindow().from,
  );
  const toAdd = rows.flatMap((r) => (r.verdict === "add" && r.value ? [r.value] : []));

  const off = await holidaySet();
  let added = 0;

  for (const t of toAdd) {
    const doerId = idByEmail.get(t.doerEmail);
    if (!doerId) continue; // the parser already refused these; belt and braces

    const [row] = await checklistDb
      .insert(tasks)
      .values({
        name: t.name,
        doerId,
        frequency: t.frequency,
        startDate: t.startDate,
        endDate: t.endDate,
        assignedBy: t.assignedBy,
        active: true,
      })
      .returning({ id: tasks.id });

    await generateForTask(
      {
        id: row.id,
        name: t.name,
        doerId,
        frequency: t.frequency,
        startDate: t.startDate,
        endDate: t.endDate,
        active: true,
      },
      off,
    );
    added++;
  }

  paths();
  return {
    added,
    skipped: rows.filter((r) => r.verdict === "skip").length,
    failed: rows.filter((r) => r.verdict === "error").length,
  };
}
