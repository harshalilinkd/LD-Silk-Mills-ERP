import { redirect } from "next/navigation";

import { DepartmentsPanel } from "@/components/help-slip/settings/departments-panel";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { settingsTabsFor } from "@/lib/help-slip/settings";

/**
 * A rendering guard, not the boundary. The API route re-checks the role and
 * the database checks again beneath that — this only decides whether somebody
 * lands on a screen they cannot use or on the tab they can.
 */
export default async function Page() {
  const session = await resolveHelpSlipSession();
  if (!session) return null;
  if (!settingsTabsFor(session.role).departments) redirect("/help-slip/settings");
  return <DepartmentsPanel />;
}
