import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";

import { auth } from "@/auth";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { HelpSlipSessionProvider } from "@/lib/help-slip/context";

/**
 * Help Slip's authorization layer, mirroring `src/app/(app)/crm/layout.tsx`.
 *
 * Same two-layer shape as Orders and CRM: the ERP owns the login, the module
 * owns the role. A person signs in once to the shell, and their Help Slip
 * role / department / confidential-access flag are read LIVE from
 * `ld_help_slip.profiles` — the same row the standalone app uses, so a change
 * there takes effect here on the next request with no re-login.
 *
 * ⚠️ THE NULL BRANCH IS NOT COSMETIC. `resolveHelpSlipSession()` returns null
 * when the signed-in email has no Help Slip profile, or has one that is
 * inactive or suspended. It MUST render this screen and never an empty list:
 * an unprovisioned person shown a list with nothing in it reads it as "I have
 * no concerns", which is a different and much worse statement than "you do not
 * have an account here yet".
 *
 * Unlike Order Entry, no capability is resolved into an app-level check. Help
 * Slip's rules live in RLS and every query runs inside `withHelpSlip()`, where
 * the database applies them. What goes into the context below is for RENDERING
 * only.
 */
export default async function HelpSlipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const helpSlip = await resolveHelpSlipSession();

  if (!helpSlip) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          Not provisioned for Help Slip
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          Help Slip keeps its own list of people, and your ERP account (
          {session.user.email}) isn&apos;t set up there yet. Ask a Help Slip
          admin to add you — or to re-activate your account if it was switched
          off.
        </p>
      </div>
    );
  }

  return (
    <HelpSlipSessionProvider
      value={{
        fullName: helpSlip.fullName,
        email: helpSlip.email,
        role: helpSlip.role,
        hrAccess: helpSlip.hrAccess,
        departmentId: helpSlip.departmentId,
        locale: helpSlip.locale,
      }}
    >
      {children}
    </HelpSlipSessionProvider>
  );
}
