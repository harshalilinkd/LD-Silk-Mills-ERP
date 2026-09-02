import { auth } from "@/auth";
import {
  unsafeLookupProfileByEmail,
  withHelpSlip,
  type HelpSlipDb,
} from "@/db/help-slip/rls";
import type { AccountStatus, UserRole } from "@/db/help-slip/schema";

// How a shell session becomes a Help Slip identity.
//
// Same two-layer shape as Order Entry (see src/lib/order-entry/authz.ts): the
// ERP owns the login, the module owns the role. A person signs in once, and
// their Help Slip role/department/hr_access are read live from
// `ld_help_slip.profiles` — the same row the standalone app uses, so a role
// change there takes effect here on the next request with no re-login.
//
// Unlike Order Entry, the capabilities are NOT resolved into app-level
// checks: Help Slip's rules live in RLS, and every query runs inside
// `withHelpSlip()` where the database applies them. `role` and `hrAccess`
// below are for RENDERING decisions only — which nav items to show, whether
// to offer a "resolve" button. They are never the security boundary. If a
// screen forgets to hide a control, the worst case is a failed write, not a
// disclosure.

export type HelpSlipSession = {
  profileId: string;
  fullName: string;
  email: string;
  role: UserRole;
  /** Read-only rendering hint. The real gate is the RLS policy. */
  hrAccess: boolean;
  departmentId: string | null;
  locale: string;
  avatarUrl: string | null;
};

/** Staff = anyone who works the queue rather than only their own concerns. */
export function isStaff(role: UserRole): boolean {
  return role === "pc" || role === "admin";
}

/**
 * The Help Slip identity for the current shell session, or null when the
 * signed-in person has no Help Slip profile or their account is not active.
 * Callers render a "not provisioned" screen for null — never a crash, and
 * never a silent empty list, which would read as "you have no concerns".
 */
export async function resolveHelpSlipSession(): Promise<HelpSlipSession | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const profile = await unsafeLookupProfileByEmail(email);
  if (!profile) return null;

  // `inactive` and `suspended` both mean "cannot use the app". The standalone
  // app blocks these at sign-in; we block them here because sign-in happened
  // in the shell, which knows nothing about Help Slip.
  if (profile.status !== ("active" satisfies AccountStatus)) return null;

  return {
    profileId: profile.id,
    fullName: profile.fullName,
    email,
    role: profile.role,
    hrAccess: profile.hrAccess,
    departmentId: profile.departmentId,
    locale: profile.locale,
    avatarUrl: profile.avatarUrl,
  };
}

/**
 * Resolve the session and run `fn` inside that person's RLS context.
 * Throws `NotProvisionedError` when there is no usable profile, so a caller
 * that forgets to check cannot accidentally run as nobody.
 */
export async function withCurrentUser<T>(
  fn: (db: HelpSlipDb, session: HelpSlipSession) => Promise<T>,
): Promise<T> {
  const session = await resolveHelpSlipSession();
  if (!session) throw new NotProvisionedError();
  return withHelpSlip(session.profileId, (db) => fn(db, session));
}

export class NotProvisionedError extends Error {
  constructor() {
    super("No active Help Slip profile for the signed-in account");
    this.name = "NotProvisionedError";
  }
}
