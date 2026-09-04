"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { withHelpSlip } from "@/db/help-slip/rls";
import { users } from "@/db/schema";
import { resolveHelpSlipSession } from "@/lib/help-slip/authz";
import { updateOwnProfile as updateOwnHelpSlipProfile } from "@/lib/help-slip/settings";

/**
 * Your OWN account. No admin check anywhere in this file, on purpose — every
 * function here resolves the target from the SESSION and can only ever touch
 * the signed-in person's row.
 *
 * That is why these are separate from `./users/actions.ts` rather than a
 * special case inside them: there is no id parameter to tamper with. A bug
 * here cannot become "edit somebody else" because there is no somebody else.
 */

const BCRYPT_COST = 10;

/**
 * Six characters, any characters. Mirrors `PASSWORD_MIN` in
 * `./users/actions.ts` — see that file for why there is no complexity rule and
 * for bcrypt's own 72-byte ceiling. Both are enforced server-side; the length
 * constants in the two forms are for the disabled state only.
 */
const MIN = 6;

async function currentUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Sign in to continue.");

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!row || row.status !== "active") throw new Error("Sign in to continue.");
  return row;
}

/**
 * Your name and your phone number — the two facts about you that are yours to
 * change.
 *
 * ── WHY THIS ALSO WRITES INTO HELP SLIP ───────────────────────────────────
 *
 * Help Slip used to carry its own "Your details" tab, filed under Help Slip
 * rules, holding the same name and the phone number its WhatsApp updates are
 * sent to. That is not a rule of Help Slip, so the screen moved here — and a
 * moved screen has to keep the number reaching the dispatcher, or the move
 * silently turns those messages off.
 *
 * So the ERP row is the anchor and Help Slip is MIRRORED from it. There is
 * deliberately no second field and no second Save; two boxes holding one phone
 * number is how they end up disagreeing.
 *
 * ── AND WHY IT IS NOT AN RLS BYPASS ───────────────────────────────────────
 *
 * `src/lib/people.ts` bypasses RLS because an ADMIN acts on the system from
 * outside it. This is the opposite case: you are editing your own profile, so
 * there is a real `auth.uid()` to run as — the same one Help Slip's own screen
 * used. It goes through `withHelpSlip` and `profiles_update_self` decides,
 * exactly as before. Nothing here is reachable for anybody else's row.
 */
export async function updateOwnDetails(name: string, phone: string) {
  const me = await currentUser();
  const value = name.trim();
  if (!value) throw new Error("Your name cannot be blank.");
  if (value.length > 120) throw new Error("That name is too long.");

  // Not format-checked. Numbers here are written with spaces, with +91, and
  // occasionally two of them — a pattern would reject more real numbers than
  // fake ones. Blank means "not given", which is why it stores NULL.
  const tel = phone.trim();
  if (tel.length > 40) throw new Error("That phone number is too long.");

  await db
    .update(users)
    .set({ name: value, phone: tel || null, updatedAt: new Date() })
    .where(eq(users.id, me.id));

  revalidatePath("/settings");

  // Most people have no Help Slip profile, and that is not a failure — there
  // is simply nothing to mirror into.
  const hs = await resolveHelpSlipSession();
  if (!hs) return;

  try {
    await withHelpSlip(hs.profileId, (hsDb) =>
      updateOwnHelpSlipProfile(hsDb, hs.profileId, {
        fullName: value,
        phone: tel || null,
      }),
    );
  } catch {
    // The ERP write above already succeeded and is not rolled back — saying
    // "that didn't work" about a change that did would be worse than saying
    // exactly which half is behind.
    throw new Error(
      "Saved here, but your Help Slip profile could not be updated. Try again in a moment.",
    );
  }
}

/**
 * Set or change your own password.
 *
 * TWO CASES, and the difference matters:
 *
 *  · You already have one. The current password is REQUIRED and verified. A
 *    session left open on a shared factory phone must not be enough to lock
 *    its owner out of their own account.
 *  · You have none — you have only ever signed in with Google. There is no
 *    current password to ask for, so the signed-in session is the proof. This
 *    is the normal way somebody adds password sign-in for themselves without
 *    having to ask an admin for one.
 *
 * The plain values never leave this function. Nothing is logged, nothing is
 * returned, and the hash is written once.
 */
export async function changeOwnPassword(current: string, next: string) {
  const me = await currentUser();
  // Trimmed to match how it was STORED — every set path trims before hashing,
  // so an untrimmed comparison rejects a correct password that arrived with a
  // stray space from a paste or a phone keyboard.
  current = current.trim();

  const value = next.trim();
  if (value.length < MIN) throw new Error(`Use at least ${MIN} characters.`);

  if (me.passwordHash) {
    if (!current) throw new Error("Enter your current password.");
    const ok = await compare(current, me.passwordHash);
    if (!ok) throw new Error("That current password is not right.");
    if (await compare(value, me.passwordHash)) {
      throw new Error("That is the password you already have.");
    }
  }

  await db
    .update(users)
    .set({
      passwordHash: await hash(value, BCRYPT_COST),
      passwordSetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, me.id));

  revalidatePath("/settings");
}

/**
 * Remove your own password, leaving Google as your only way in.
 *
 * Refused unless the current password is given — otherwise an open session is
 * enough to strip a colleague's second sign-in method. The admin screen
 * deliberately cannot do this to you either; it points here, so that whoever
 * removes it is the person who knows whether Google still works for them.
 */
export async function removeOwnPassword(current: string) {
  const me = await currentUser();
  current = current.trim();
  if (!me.passwordHash) return;

  if (!current) throw new Error("Enter your current password.");
  if (!(await compare(current, me.passwordHash))) {
    throw new Error("That current password is not right.");
  }

  await db
    .update(users)
    .set({ passwordHash: null, passwordSetAt: null, updatedAt: new Date() })
    .where(eq(users.id, me.id));

  revalidatePath("/settings");
}
