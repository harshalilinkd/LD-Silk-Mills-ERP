import { HelpSlipSettingsTabs } from "@/components/help-slip/settings-tabs";
import { Reveal } from "@/components/ui/reveal";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { settingsTabsFor } from "@/lib/help-slip/settings";

/**
 * Help Slip rules.
 *
 * ONE screen now, so the tab strip renders only if a second one ever returns —
 * a strip with a single pill in it says "there is more here" about a page that
 * has nothing more. Four screens moved out and every old address redirects;
 * `settingsTabsFor` lists where each went and why.
 *
 * NO GUARD HERE, deliberately. This layout also wraps the redirect stubs left
 * behind at the old addresses, and refusing a non-admin at this level would
 * send somebody following an old Access-requests bookmark to the Help Slip
 * dashboard instead of the ERP screen it now lives on. Each page guards
 * itself, and the API and the database guard again beneath that.
 */
export default async function HelpSlipSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await resolveHelpSlipSession();
  const tabs = session ? settingsTabsFor(session.role) : null;
  const showTabs = tabs
    ? Object.values(tabs).filter(Boolean).length > 1
    : false;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Help Slip rules
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          How Help Slip behaves — response times, WhatsApp updates and quiet
          hours. People and your own details are in Settings.
        </p>
      </div>
      {showTabs && tabs ? (
        <Reveal index={0}>
          <HelpSlipSettingsTabs visible={tabs} />
        </Reveal>
      ) : null}
      <Reveal index={showTabs ? 1 : 0}>{children}</Reveal>
    </div>
  );
}
