import { redirect } from "next/navigation";

import { ProfilePanel } from "@/components/help-slip/settings/profile-panel";
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
  // NOT `redirect("/help-slip/settings")` — that is this page, and a page that
  // redirects to itself is an infinite loop. It never fired only because
  // `profile` is hardcoded true in settingsTabsFor; that is one edit away from
  // being a hang, so it goes somewhere real.
  if (!settingsTabsFor(session.role).profile) redirect("/help-slip");
  return <ProfilePanel />;
}
