import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, occurrences, tasks } from "@/db/checklist/schema";
import { resolveChecklistViewer } from "@/lib/checklist/authz";
import { generationWindow } from "@/lib/checklist/dates";
import { TasksScreen } from "./tasks-screen";

export const metadata: Metadata = {
  title: "Tasks — LD Silk Mills ERP",
};

/**
 * Tasks — the standing duties themselves, not the dated rows people tick.
 *
 * Administrators only. Deciding who does what is the job this screen exists
 * for, and it is not a member's to do.
 *
 * The whole list is fetched and filtered in the browser. That is a decision
 * with a limit on it: their comparable list runs to about a thousand rows,
 * which is a few hundred kilobytes and filters instantly, and the alternative
 * — a round trip per keystroke across six filters — is slower and no more
 * correct. Past a few thousand this should become a server query; the note is
 * here so that judgement is a choice rather than a surprise.
 */
export default async function TasksPage() {
  const viewer = await resolveChecklistViewer();
  if (!viewer) redirect("/checklist");
  if (!viewer.isAdmin) redirect("/checklist/master");

  const rows = await checklistDb
    .select({
      id: tasks.id,
      name: tasks.name,
      doerId: tasks.doerId,
      doerName: doers.name,
      doerEmail: doers.email,
      department: doers.department,
      frequency: tasks.frequency,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      assignedBy: tasks.assignedBy,
      notes: tasks.notes,
      active: tasks.active,
    })
    .from(tasks)
    .innerJoin(doers, eq(doers.id, tasks.doerId))
    .orderBy(asc(tasks.name));

  const people = await checklistDb
    .select({
      id: doers.id,
      name: doers.name,
      email: doers.email,
      department: doers.department,
      active: doers.active,
    })
    .from(doers)
    .orderBy(asc(doers.name));

  // How many dated rows exist right now. Shown beside "Rebuild schedule" so
  // pressing it has a before-and-after somebody can see, rather than being a
  // button that appears to do nothing.
  const [{ n: scheduledRows }] = await checklistDb
    .select({ n: sql<number>`count(*)::int` })
    .from(occurrences);

  return (
    <TasksScreen
      rows={rows}
      people={people}
      scheduledRows={scheduledRows}
      window={generationWindow()}
    />
  );
}
