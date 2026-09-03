import { SettingsTabs } from "@/components/shell/settings-tabs";
import { Reveal } from "@/components/ui/reveal";
import { isErpAdmin } from "@/lib/admin";

/**
 * ERP settings.
 *
 * Everybody reaches this — the profile tab is theirs. The four administration
 * tabs appear only for an ERP admin, which is presentation: each of those
 * routes guards itself, and every action underneath calls `requireErpAdmin()`
 * before reading its arguments.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isErpAdmin();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Settings
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          {admin
            ? "Your account, and the people, access and systems behind this ERP."
            : "Your account and how you sign in."}
        </p>
      </div>
      <Reveal index={0}>
        <SettingsTabs isAdmin={admin} />
      </Reveal>
      <Reveal index={1}>{children}</Reveal>
    </div>
  );
}
