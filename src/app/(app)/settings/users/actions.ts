"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireErpAdmin } from "@/lib/admin";
import {
  deletePerson,
  personFootprint,
  setHelpSlipAccess,
  setOrderEntryRole,
  type Footprint,
  type HelpSlipRole,
  type OrderEntryRole,
} from "@/lib/people";

/**
 * Every action here calls `requireErpAdmin()` FIRST, before reading its
 * arguments. A server action is a POST endpoint — hiding the page does not
 * hide the action, and until this file had these checks, any signed-in
 * employee could edit any account.
 */

/** bcrypt cost 10 — the same as `ld_order_entry.users`, so hashes match in strength. */
const BCRYPT_COST = 10;

/**
 * SIX. Set by the owner, lowered from ten, and it is the ONLY rule.
 *
 * No complexity requirement (one capital, one digit, one symbol) — those push
 * people toward `Password1!` and a sticky note. No character is rejected:
 * spaces, punctuation, emoji and every alphabet are all fine, and nothing here
 * strips or normalises them beyond a `.trim()` of the outer edges, which every
 * set-path does identically so a stored password always compares back equal.
 *
 * The one length limit nobody can remove: bcrypt hashes at most 72 BYTES and
 * silently ignores the rest, so two passwords sharing their first 72 bytes are
 * the same password to it. No practical human hits that, and blocking it would
 * be a "limit" the owner explicitly did not want — but it is real, so it is
 * written down here rather than discovered later.
 *
 * This is an internal ERP behind Google sign-in on a list of approved
 * accounts, not a public site.
 */
// NOT exported: a "use server" file may only export async functions, and Next
// refuses the whole module otherwise. The dialog keeps its own copy for the
// disabled state; this one is what actually enforces it.
const PASSWORD_MIN = 6;

export async function updateUser(
  id: string,
  data: {
    name: string;
    status: "active" | "inactive";
    role?: "member" | "admin";
  },
) {
  const admin = await requireErpAdmin();

  // An admin cannot deactivate or demote THEMSELVES. Not paternalism — this
  // shell has no recovery path: with no active admin, nobody can promote one
  // back from inside the app and it needs a hand-written SQL statement to fix.
  if (id === admin.id) {
    if (data.status !== "active") {
      throw new Error("You cannot deactivate your own account.");
    }
    if (data.role === "member") {
      throw new Error(
        "You cannot remove your own administrator access. Ask another admin.",
      );
    }
  }

  await db
    .update(users)
    .set({
      name: data.name,
      status: data.status,
      ...(data.role ? { role: data.role } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  revalidatePath("/admin/users");
}

/**
 * Give somebody a password, or replace the one they have.
 *
 * The plain password reaches this function and nothing else: it is hashed here
 * and the hash is what is stored. It is never logged, never returned, and
 * never written to the audit trail.
 *
 * There is no "email it to them" — this app sends no email, and a password in
 * an inbox outlives every rotation. The admin reads it out or hands it over,
 * and the person changes it from their own Settings.
 */
export async function setUserPassword(id: string, password: string) {
  await requireErpAdmin();

  const value = password.trim();
  if (value.length < PASSWORD_MIN) {
    throw new Error(`Use at least ${PASSWORD_MIN} characters.`);
  }

  const [target] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) throw new Error("That person no longer exists.");

  await db
    .update(users)
    .set({
      passwordHash: await hash(value, BCRYPT_COST),
      passwordSetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  revalidatePath("/admin/users");
}

/**
 * Take a password away, leaving Google as the only way in for that person.
 *
 * Distinct from setting an empty one, which the schema does not allow:
 * `password_hash` goes back to NULL, and the provider treats null and wrong
 * identically, so nothing about the login form changes shape for them.
 */
export async function clearUserPassword(id: string) {
  const admin = await requireErpAdmin();

  // Removing your OWN password while Google is the only alternative is fine —
  // but only if Google actually works for you, and this app cannot know that.
  // The one case it can rule out is locking the last admin out entirely.
  if (id === admin.id) {
    throw new Error(
      "Remove your own password from your Settings, not here — so you confirm you can still sign in another way.",
    );
  }

  await db
    .update(users)
    .set({ passwordHash: null, passwordSetAt: null, updatedAt: new Date() })
    .where(eq(users.id, id));

  revalidatePath("/admin/users");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  One person's access to all three systems, saved together
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Replaces three screens in three places. Before this, adding a joiner meant
 * ERP Settings, then Order Entry Settings, then Help Slip Settings — so people
 * were added to one and forgotten in the others. Fourteen records existed for
 * what should have been one team.
 *
 * ORDER MATTERS, and it is deliberate: ERP first, because that is the account
 * that lets anybody sign in at all. If Order Entry or Help Slip fails
 * afterwards, the person can still get in and an admin can retry the rest —
 * whereas granting module access to somebody with no way to sign in leaves a
 * row nobody can use.
 *
 * Nothing is deleted anywhere. Removing access DEACTIVATES: `is_active=false`
 * in Order Entry (the state its standalone app already understands), and
 * `status='inactive'` in Help Slip. Deleting a Help Slip profile would cascade
 * from `auth.users` and take the person's concerns with it.
 */
export async function savePersonAccess(args: {
  email: string;
  name: string;
  erpRole: "member" | "admin" | null;
  orderEntryRole: OrderEntryRole | null;
  helpSlipRole: HelpSlipRole | null;
  helpSlipDepartmentId: string | null;
  helpSlipHrAccess: boolean;
}) {
  const admin = await requireErpAdmin();

  const email = args.email.trim().toLowerCase();
  const name = args.name.trim();
  if (!email || !email.includes("@")) throw new Error("Enter a valid email.");
  if (!name) throw new Error("Enter a name.");

  // The same self-protection the single-system screen had. With no active
  // admin, nobody can promote one back from inside the app.
  const [self] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (self && self.id === admin.id && args.erpRole !== "admin") {
    throw new Error("You cannot remove your own administrator access.");
  }

  // 1. the ERP account — the thing that lets them sign in
  if (args.erpRole === null) {
    if (self) {
      if (self.id === admin.id)
        throw new Error("You cannot remove your own access.");
      await db
        .update(users)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(eq(users.id, self.id));
    }
  } else if (self) {
    await db
      .update(users)
      .set({
        name,
        role: args.erpRole,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, self.id));
  } else {
    await db.insert(users).values({
      name,
      email,
      role: args.erpRole,
      status: "active",
    });
  }

  // 2. Order Entry, and 3. Help Slip
  await setOrderEntryRole(email, args.orderEntryRole, name);
  await setHelpSlipAccess(email, {
    role: args.helpSlipRole,
    departmentId: args.helpSlipDepartmentId,
    hrAccess: args.helpSlipHrAccess,
    name,
  });

  revalidatePath("/settings/users");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Taking somebody OUT — the two different things that means
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There was no way to do either from this screen, and that was the gap. The
 * only route was to open the dialog and set three separate dropdowns to "No
 * access" one at a time — which does work, but nobody would guess it, and the
 * dropdowns were showing raw codes like `member` and `none` instead of their
 * labels, so it did not even read as a choice.
 *
 * They are deliberately two actions, because they are not the same decision:
 *
 *   · REMOVE ACCESS is the everyday one — somebody leaves, or changes job.
 *     They keep their record and everything they ever did keeps their name on
 *     it. Reversible: give the roles back and they are in again.
 *   · DELETE is for rows that were never a person doing work — a duplicate
 *     account on an old email, a profile called "test admin". Permanent, and
 *     refused outright the moment anything anywhere references them.
 */

/** What would be orphaned by deleting this person — drives the dialog. */
export async function getPersonFootprint(email: string): Promise<Footprint> {
  await requireErpAdmin();
  return personFootprint(email);
}

/**
 * Remove every system's access in one action.
 *
 * The same writes `savePersonAccess` performs with all three roles null, given
 * a name of its own so it is a button rather than a sequence somebody has to
 * work out. Nothing is deleted: Order Entry goes `is_active = false`, Help Slip
 * goes `status = 'inactive'`, the ERP account goes `status = 'inactive'`.
 */
export async function removeAllAccess(email: string) {
  const admin = await requireErpAdmin();
  const e = email.trim().toLowerCase();

  const [target] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, e))
    .limit(1);

  // With no active admin nobody can promote one back from inside the app.
  if (target && target.id === admin.id) {
    throw new Error("You cannot remove your own access.");
  }

  if (target) {
    await db
      .update(users)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(users.id, target.id));
  }
  await setOrderEntryRole(e, null, target?.name ?? e);
  await setHelpSlipAccess(e, {
    role: null,
    departmentId: null,
    hrAccess: false,
    name: target?.name ?? e,
  });

  revalidatePath("/settings/users");
}

/**
 * Delete permanently, from all three systems.
 *
 * `deletePerson` re-runs the footprint check itself and throws if anything
 * references them — this is a POST endpoint and the email arrives from the
 * browser, so the screen having hidden the button proves nothing.
 */
export async function deletePersonAction(email: string) {
  const admin = await requireErpAdmin();
  const e = email.trim().toLowerCase();

  if (e === (admin.email ?? "").toLowerCase()) {
    throw new Error("You cannot delete your own account.");
  }

  await deletePerson(e);
  revalidatePath("/settings/users");
}
