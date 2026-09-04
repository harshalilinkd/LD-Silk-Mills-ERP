import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccessRequestsPanel } from "@/components/help-slip/settings/access-requests-panel";
import { getErpAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Access requests — LD Silk Mills ERP",
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Access requests — people waiting to be let in
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This lived under Help Slip rules, which is where it was raised as wrong:
 * deciding who joins the company's systems is not a rule of Help Slip, it is
 * the same job the People tab two entries to the left already does. Somebody
 * approving a joiner had to open a module's configuration screen to do it.
 *
 * Nothing about the mechanism moved. The panel is the same component, calling
 * the same `/api/help-slip/settings/access-requests` route, which still runs
 * inside `withHelpSlip` and still lets `approve_access_request` create the
 * profile in one transaction. Only the address changed.
 *
 * ── WHY REQUESTS EXIST AT ALL, AND ONLY FOR HELP SLIP ─────────────────────
 *
 * `ld_help_slip.profiles.id` is a foreign key to `auth.users.id`, so a Help
 * Slip profile cannot exist until the person has signed in at least once.
 * They sign in, a request appears here, an admin decides. The ERP and Order
 * Entry have no such constraint — an admin adds those people outright from the
 * People tab — which is why this screen has one system's name on its rows.
 *
 * ── PERMISSIONS ───────────────────────────────────────────────────────────
 *
 * ERP admin to reach the page; the API keeps its own Help Slip admin check
 * underneath, so this cannot become a way around it. A shell admin with no
 * Help Slip role sees the screen and gets a refusal from the list itself,
 * which is the honest failure — the same shape /masters already has.
 */
export default async function AccessRequestsPage() {
  // Non-throwing, so a member gets the redirect its sibling tabs give rather
  // than a raw 500 — see the note in src/lib/admin.ts.
  const admin = await getErpAdmin();
  if (!admin) redirect("/settings");

  return <AccessRequestsPanel />;
}
