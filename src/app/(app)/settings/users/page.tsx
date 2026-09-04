import { redirect } from "next/navigation";

import { getErpAdmin } from "@/lib/admin";
import { loadDepartments, loadPeople } from "@/lib/people";
import { PeopleTable } from "./people-table";

/**
 * People — the one place staff access is managed.
 *
 * This screen used to list `ld_erp_core.users` only, and there were two others
 * like it: Order Entry Settings → Users, and Help Slip Settings → Users &
 * Access. Three screens for one team, so a joiner got added to whichever one
 * somebody happened to open. It showed: fourteen records, one person present in
 * all three.
 *
 * `loadPeople()` unions the three tables on the lower-cased email — the only
 * field they genuinely share — so somebody who exists in just one still appears
 * here with "No access" against the others. That absence is the point; it was
 * invisible before.
 */
export default async function PeoplePage() {
  // Non-throwing, so a member gets the redirect its sibling tabs give rather
  // than a raw 500 — see the note in src/lib/admin.ts.
  const admin = await getErpAdmin();
  if (!admin) redirect("/settings");

  const [people, departments] = await Promise.all([
    loadPeople(),
    loadDepartments(),
  ]);

  return (
    <PeopleTable
      people={people}
      departments={departments}
      adminEmail={(admin.email ?? "").toLowerCase()}
    />
  );
}
