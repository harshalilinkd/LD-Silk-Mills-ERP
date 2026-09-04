import { redirect } from "next/navigation";

import { GeneralPanel } from "@/components/help-slip/settings/general-panel";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { settingsTabsFor } from "@/lib/help-slip/settings";

/**
 * Help Slip rules — and now this page IS the rules, rather than a tab strip
 * over five screens.
 *
 * It used to render "Your details", which is a person's own name and phone
 * number: not a rule of Help Slip, and the only place in the ERP holding a
 * phone number. That moved to /settings, as did Access requests, so the one
 * screen left is the General panel and it renders here directly.
 *
 * DIRECTLY, not via a redirect to /help-slip/settings/general — the sidebar
 * points at this address, and bouncing the entry point through another URL is
 * exactly the chain that made "Order Entry rules" land on Masters.
 *
 * A rendering guard, not the boundary: the API route re-checks the role and
 * `app_settings_update` checks again beneath that.
 */
export default async function Page() {
  const session = await resolveHelpSlipSession();
  if (!session) return null;
  if (!settingsTabsFor(session.role).general) redirect("/help-slip");
  return <GeneralPanel />;
}
