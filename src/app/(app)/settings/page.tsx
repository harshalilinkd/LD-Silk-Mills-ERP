import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { getUserByEmail } from "@/lib/queries";
import { ProfileForm } from "./profile-form";

/**
 * Your profile — the one settings tab everybody gets.
 *
 * `getUserByEmail` returns `PublicUser`, so `passwordHash` is not in scope
 * here at all. Whether somebody HAS a password is derived from
 * `passwordSetAt`, which is safe to render; the hash itself never leaves
 * `src/auth.ts`.
 */
export default async function SettingsProfilePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await getUserByEmail(session.user.email);
  if (!me) redirect("/not-registered");

  // Only to word the phone field's hint correctly — whether the number also
  // reaches Help Slip's WhatsApp updates. Not a permission of any kind.
  const helpSlip = await resolveHelpSlipSession();

  return (
    <ProfileForm
      name={me.name}
      email={me.email}
      phone={me.phone ?? ""}
      hasPassword={me.passwordSetAt !== null}
      role={me.role}
      inHelpSlip={helpSlip !== null}
    />
  );
}
