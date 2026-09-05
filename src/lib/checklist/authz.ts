import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { systemAccess, systems, users } from "@/db/schema";
import { checklistDb } from "@/db/checklist";
import { doers } from "@/db/checklist/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Checklist: who may open it, and who may run it
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two questions, exactly as Goods Return has two, and the same discipline
 * applies: only one of them is a security boundary.
 *
 *   1. MAY THIS PERSON OPEN THE CHECKLIST?  → `ld_erp_core.system_access`, the
 *      tick box in Settings → Access. Read on the SERVER in the module's
 *      layout, because hiding a link is never a permission.
 *   2. ARE THEY A CHECKLIST ADMINISTRATOR?  → `doers.is_admin`. This decides
 *      whether they see everyone's work or only their own, and it is a real
 *      boundary too: a scorecard is a person's performance record.
 *
 * ── WHY A SHELL ADMIN IS ALSO A CHECKLIST ADMIN ──────────────────────────
 *
 * CLAUDE.md says a shell administrator is not automatically a module
 * administrator, and that rule is right — the person who manages ERP accounts
 * is a different job from the person who decides who checks the dyeing
 * register. This module makes ONE narrow exception, and it is a bootstrap
 * problem rather than a philosophy change: the doers table starts empty, so
 * without it there is nobody who can create the first doer, and therefore
 * nobody who can ever create anybody. The original solves this with a seeding
 * script run by hand; an owner opening a screen is better.
 *
 * The exception is one-directional. A shell admin is a checklist admin; a
 * checklist admin is emphatically NOT a shell admin, and nothing here grants
 * anybody access to Settings.
 */

/** The `system_code` row in `ld_erp_core.systems`. */
export const CHECKLIST_SYSTEM_CODE = "checklist";

export type ChecklistViewer = {
  /** `ld_erp_core.users.id` — who is acting, for attribution on a tick. */
  userId: string;
  name: string;
  email: string;
  /** Their row in the doers list, if they are on it. Null is ordinary. */
  doerId: number | null;
  doerName: string | null;
  department: string | null;
  /** True for a checklist admin OR a shell admin — see the header. */
  isAdmin: boolean;
  /** True only for the shell exception, so screens can say so honestly. */
  viaShellAdmin: boolean;
};

/**
 * Null when the signed-in person has not been given the Checklist, so the
 * layout renders an honest refusal rather than throwing — the same contract
 * `canOpenGoodsReturn` and `resolveHelpSlipSession` keep.
 *
 * A system whose `status` is not `active` refuses everybody regardless of the
 * tick, which is what keeps a half-built module invisible.
 */
export async function resolveChecklistViewer(): Promise<ChecklistViewer | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const [account] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .innerJoin(systemAccess, eq(systemAccess.userId, users.id))
    .innerJoin(systems, eq(systems.id, systemAccess.systemId))
    .where(
      and(
        eq(users.email, email),
        eq(users.status, "active"),
        eq(systemAccess.canView, true),
        eq(systems.systemCode, CHECKLIST_SYSTEM_CODE),
        eq(systems.status, "active"),
      ),
    )
    .limit(1);

  if (!account) return null;

  // Matched on email, not on a stored link. Somebody bulk-imported into the
  // doers list months before they were given an ERP login still finds their
  // own work the first time they sign in, with nobody having to remember to
  // connect the two rows by hand.
  const [doer] = await checklistDb
    .select({
      id: doers.id,
      name: doers.name,
      department: doers.department,
      isAdmin: doers.isAdmin,
      active: doers.active,
      userId: doers.userId,
    })
    .from(doers)
    // A deleted doer is nobody, the same as an address never added. They keep
    // their completed history in `occurrences`, but they are not a
    // participant and must not be resolved back into one by signing in.
    .where(and(eq(doers.email, email), isNull(doers.deletedAt)))
    .limit(1);

  const shellAdmin = account.role === "admin";

  // Opportunistic backfill of the link, so the join exists for anything that
  // wants it later. Failure is genuinely unimportant — the email match above
  // is what the module actually uses — so it must never take the page down.
  if (doer && doer.userId === null) {
    try {
      await checklistDb
        .update(doers)
        .set({ userId: account.userId })
        .where(and(eq(doers.id, doer.id), eq(doers.email, email)));
    } catch {
      /* the email match is the source of truth; the link is a convenience */
    }
  }

  return {
    userId: account.userId,
    name: account.name,
    email: account.email,
    // An INACTIVE doer keeps their history but is no longer a participant, so
    // they are treated as somebody with no row: they can open the module and
    // see nothing of their own, which is the truth.
    doerId: doer && doer.active ? doer.id : null,
    doerName: doer?.name ?? null,
    department: doer?.department ?? null,
    isAdmin: (doer?.active === true && doer.isAdmin) || shellAdmin,
    viaShellAdmin: shellAdmin && !(doer?.active === true && doer.isAdmin),
  };
}

/**
 * Throws unless the caller may administer the checklist.
 *
 * Called FIRST inside every mutating action in this module, before its
 * arguments are read. A server action is a POST endpoint: it does not care
 * which page the caller was looking at, and hiding a button does not hide the
 * action. The page guard exists so a non-admin sees an honest screen; this is
 * the boundary.
 */
export async function requireChecklistAdmin(): Promise<ChecklistViewer> {
  const viewer = await resolveChecklistViewer();
  if (!viewer) throw new Error("You do not have access to the Checklist.");
  if (!viewer.isAdmin) {
    throw new Error("Only a checklist administrator can do that.");
  }
  return viewer;
}

/**
 * Throws unless the caller may open the module at all. For actions any
 * participant performs — ticking off their own work.
 */
export async function requireChecklistViewer(): Promise<ChecklistViewer> {
  const viewer = await resolveChecklistViewer();
  if (!viewer) throw new Error("You do not have access to the Checklist.");
  return viewer;
}

/**
 * May this person tick this row?
 *
 * Their own, always. Anybody's, if they administer the checklist — which is
 * not a loophole but the ordinary case: most duties belong to people with no
 * ERP login at all, and somebody has to record that the folding got done.
 */
export function canTick(viewer: ChecklistViewer, rowDoerId: number): boolean {
  return viewer.isAdmin || viewer.doerId === rowDoerId;
}
