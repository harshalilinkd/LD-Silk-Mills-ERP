import { redirect } from "next/navigation";

import { HelpSlipSettingsTabs } from "@/components/help-slip/settings-tabs";
import { Reveal } from "@/components/ui/reveal";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { settingsTabsFor } from "@/lib/help-slip/settings";

/**
 * Help Slip Settings.
 *
 * Everyone with a profile reaches this — Profile is theirs. The other four tabs
 * appear by role (`settingsTabsFor`), which is presentation only: each route
 * re-checks, and `guard_profile_columns` / RLS check again beneath that. An
 * employee who types a URL for a tab they cannot see gets a 403 from the API
 * and an empty panel, never a working form.
 */
export default async function HelpSlipSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await resolveHelpSlipSession();
  // The parent layout already renders "not provisioned" for a null session;
  // reaching here with one means the parent changed, so fail closed.
  if (!session) redirect("/help-slip");

  const tabs = settingsTabsFor(session.role);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Help Slip Settings
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Your profile, and — for admins — the people, departments and rules
          behind Help Slip.
        </p>
      </div>
      <Reveal index={0}>
        <HelpSlipSettingsTabs visible={tabs} />
      </Reveal>
      <Reveal index={1}>{children}</Reveal>
    </div>
  );
}
