import "server-only";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { systemAccess, systems, users } from "@/db/schema";

import { parseOffice, type GoodsReturnOffice } from "./offices";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Goods Return: two questions, and they are NOT the same question
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. MAY THIS PERSON OPEN GOODS RETURN AT ALL?   -> a permission, granted by
 *      an admin in Settings → Access. This is the security boundary.
 *   2. WHICH OFFICE ARE THEY WORKING AS RIGHT NOW? -> a choice they make on
 *      entry and can change. This is a MODE, not a permission.
 *
 * Keeping them apart is the whole design, and it was a correction: an earlier
 * draft of this file made the office an assigned role on
 * `ld_erp_core.users.goods_return_role`, with a fourth dropdown on the People
 * screen. The owner asked for something different and simpler — clicking the
 * menu asks "Head Office or Bhiwandi Office?" and you pick, exactly as the
 * standalone app's front page does. That column was never applied to the
 * database and has been removed from the schema.
 *
 * ── QUESTION 2 IS NOT A SECURITY BOUNDARY, AND MUST NEVER BE TREATED AS ONE ─
 *
 * Anybody who can open the module can pick either office, and switch whenever
 * they like — that is the owner's explicit decision and it mirrors the
 * standalone app, where the two cards are on a public page with no password.
 * So `canCreateReturns()` and friends below shape the WORKFLOW: they decide
 * which screens and buttons a person is shown while they are working as an
 * office. They do not decide who is trustworthy. Never write a check that
 * assumes a Bhiwandi session could not have been a Head Office session a moment
 * ago, and never put anything genuinely sensitive behind one.
 *
 * ── QUESTION 1 IS, AND IT NEEDED BUILDING ─────────────────────────────────
 *
 * `ld_erp_core.system_access` already exists, is already edited from
 * Settings → Access, and already decides who sees a system in the sidebar. What
 * it did NOT do is guard a route: `getVisibleSystemsForUser` is called in
 * exactly one place, `src/app/(app)/layout.tsx`, to build the menu. Every other
 * module gets away with that because it guards itself with its own account
 * table — `resolveOrderEntryAuthz` reads `ld_order_entry.users`,
 * `resolveHelpSlipSession` reads `ld_help_slip.profiles`.
 *
 * Goods Return has no such table to read. Its `goods_return.users` holds three
 * rows: two shared passwordless office logins and one person, and it is a live
 * foreign-key target in a schema this repo may not migrate. So without the
 * check below, hiding the menu entry would have been the ONLY thing standing
 * between any signed-in employee and marking stock received. Hiding a link is
 * never a permission.
 *
 * `canOpenGoodsReturn` therefore reads `system_access` server-side on the
 * module's layout. No new table, no new column — the tick box in Settings →
 * Access finally means something on both sides.
 */

/** The system_code in `ld_erp_core.systems`, already seeded as "coming soon". */
export const GOODS_RETURN_SYSTEM_CODE = "goods-return-lr";

/**
 * Where the chosen office lives.
 *
 * A cookie, not the database and not the Auth.js session. The reasons are all
 * about what the choice IS:
 *
 *   · It is per DEVICE and per person — the same coordinator may work as Head
 *     Office at a desk and Bhiwandi on a phone in the warehouse on the same
 *     day. A column on their account would force one answer for both.
 *   · It must survive a page load and a navigation, so React state is out.
 *   · It is read on the SERVER, on nearly every screen in the module, to
 *     decide what to render — so `localStorage` is out too.
 *   · It carries no authority (see the header), so it does not need to be
 *     signed or verified. The worst a tampered value can do is show somebody
 *     the screens for the other office, which they could reach by clicking a
 *     button anyway.
 *
 * `httpOnly` is deliberately false: the office switcher is a client component
 * and reads it to show which office is active without a round trip.
 */
const OFFICE_COOKIE = "ld-gr-office";
const OFFICE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days — long enough to stop nagging

/** The office this browser last chose, or null if it has not chosen yet. */
export async function getChosenOffice(): Promise<GoodsReturnOffice | null> {
  const jar = await cookies();
  return parseOffice(jar.get(OFFICE_COOKIE)?.value);
}

/**
 * Record the choice. Called from a server action behind the chooser screen.
 *
 * Not exported as a server action from this file on purpose — this module is
 * `server-only` and imported by layouts; the action lives beside the screen
 * that uses it so the "use server" boundary stays visible where it is called.
 */
export async function setChosenOffice(office: GoodsReturnOffice): Promise<void> {
  const jar = await cookies();
  jar.set(OFFICE_COOKIE, office, {
    maxAge: OFFICE_MAX_AGE,
    sameSite: "lax",
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearChosenOffice(): Promise<void> {
  const jar = await cookies();
  jar.delete(OFFICE_COOKIE);
}

// ─── question 1: may they open the module at all ───────────────────────────

export type GoodsReturnAccess = {
  /** `ld_erp_core.users.id` — who is acting, for attribution on new records. */
  userId: string;
  name: string;
  email: string;
};

/**
 * Null when the signed-in person has not been granted Goods Return, so the
 * layout can render a "not provisioned" screen rather than throwing a 500 —
 * the same contract `resolveOrderEntryAuthz` and `resolveHelpSlipSession` keep.
 *
 * A system whose `status` is not `active` refuses everybody regardless of the
 * tick, which is how the rest of the shell behaves and is what keeps the module
 * invisible while it is still being built.
 */
export async function canOpenGoodsReturn(): Promise<GoodsReturnAccess | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const [row] = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(systemAccess, eq(systemAccess.userId, users.id))
    .innerJoin(systems, eq(systems.id, systemAccess.systemId))
    .where(
      and(
        eq(users.email, email),
        eq(users.status, "active"),
        eq(systemAccess.canView, true),
        eq(systems.systemCode, GOODS_RETURN_SYSTEM_CODE),
        eq(systems.status, "active"),
      ),
    )
    .limit(1);

  return row ?? null;
}

// ─── question 2 lives in ./offices ────────────────────────────────────────
//
// The office vocabulary and the capability helpers are in `./offices`, which
// has no imports at all. They are re-exported here so a server component can
// keep importing one module, but a CLIENT component must import them from
// `./offices` directly — importing them through this file drags `server-only`
// and `next/headers` into the browser bundle, which does not just fail to
// compile this module, it takes unrelated pages down with it.
export {
  OFFICES,
  OFFICE_LABEL,
  canCreateReturns,
  canEditReturns,
  canManageMasters,
  canReceive,
  homePathForOffice,
  type GoodsReturnOffice,
} from "./offices";
