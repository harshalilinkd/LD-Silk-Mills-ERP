"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

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
const MIN = 10;

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

export async function updateOwnName(name: string) {
  const me = await currentUser();
  const value = name.trim();
  if (!value) throw new Error("Your name cannot be blank.");
  if (value.length > 120) throw new Error("That name is too long.");

  await db
    .update(users)
    .set({ name: value, updatedAt: new Date() })
    .where(eq(users.id, me.id));

  revalidatePath("/settings");
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
