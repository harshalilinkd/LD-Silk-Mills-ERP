import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, tasks } from "@/db/checklist/schema";
import { resolveChecklistViewer } from "@/lib/checklist/authz";
import { getDepartmentOptions } from "@/lib/checklist/departments";
import { DoersScreen } from "./doers-screen";

export const metadata: Metadata = {
  title: "Doers — LD Silk Mills ERP",
};

/**
 * Doers — the people duties belong to.
 *
 * Administrators only. A non-admin is sent to their own checklist rather than
 * shown a refusal: the list of everybody in the company is not something a
 * member has any business reading, and there is a screen that IS for them.
 * (`resolveChecklistViewer` has already established they may open the module
 * at all; this is the second question.)
 *
 * Two queries, sequential — well inside the pool's limit of four concurrent.
 */
export default async function DoersPage() {
  const viewer = await resolveChecklistViewer();
  if (!viewer) redirect("/checklist");
  if (!viewer.isAdmin) redirect("/checklist/master");

  const rows = await checklistDb
    .select({
      id: doers.id,
      name: doers.name,
      email: doers.email,
      department: doers.department,
      isAdmin: doers.isAdmin,
      active: doers.active,
      hasLogin: sql<boolean>`${doers.userId} is not null`,
    })
    .from(doers)
    .orderBy(asc(doers.name));

  // Task counts, so Delete can say what it is refusing before somebody clicks
  // it rather than after.
  const counts = await checklistDb
    .select({ doerId: tasks.doerId, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.active, true))
    .groupBy(tasks.doerId);

  const byDoer = new Map(counts.map((c) => [c.doerId, c.n]));

  // The company department list from Masters, merged with whatever the
  // checklist's own people are already in — see lib/checklist/departments.ts.
  const departments = await getDepartmentOptions();

  return (
    <DoersScreen
      rows={rows.map((r) => ({ ...r, taskCount: byDoer.get(r.id) ?? 0 }))}
      departments={departments}
    />
  );
}
