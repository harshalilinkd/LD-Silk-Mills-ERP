import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Who may administer the SHELL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This exists because it did not, and its absence was a live privilege
 * escalation. `/admin/users`, `/admin/system-registry` and
 * `/admin/access-control` were behind nothing but `middleware.ts`'s "are you
 * signed in", and their three server actions carried no check whatsoever. Any
 * employee could open the access-control grid and tick themselves into Order
 * Entry, or edit anybody's account.
 *
 * ── A PAGE GUARD IS NOT ENOUGH ────────────────────────────────────────────
 *
 * A server action is a POST endpoint. It does not care which page the caller
 * was looking at, and hiding the page does not hide the action — anybody who
 * knows the action id can invoke it directly. So `requireErpAdmin()` is called
 * INSIDE every mutating action, not only in the layout above it. The layout
 * check is there so a non-admin sees an honest refusal instead of a form that
 * will reject them; the action check is the actual boundary.
 *
 * ── SHELL ADMIN IS NOT MODULE ADMIN ───────────────────────────────────────
 *
 * This decides shell administration only. Order Entry resolves its own role
 * from `ld_order_entry.users` and Help Slip from `ld_help_slip.profiles`, and
 * neither consults this. A shell admin is not automatically allowed to delete
 * an order, and should not be: the person who manages accounts is a different
 * job from the person who runs the order book.
 */

export type ErpAdminSession = {
  id: string;
  email: string;
  name: string;
};

/** The signed-in person's shell role, or null if they are not signed in. */
export async function getErpRole(): Promise<"member" | "admin" | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const [row] = await db
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!row || row.status !== "active") return null;
  return row.role;
}

export async function isErpAdmin(): Promise<boolean> {
  return (await getErpRole()) === "admin";
}

/**
 * Throws unless the caller is an active shell admin.
 *
 * Every mutating action under `/admin` calls this FIRST, before reading its
 * arguments. The message is deliberately the same whoever asks — a
 * non-admin learns that they are not an admin, and nothing else.
 */
export async function requireErpAdmin(): Promise<ErpAdminSession> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Sign in to continue.");

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!row || row.status !== "active" || row.role !== "admin") {
    throw new Error("Only an ERP administrator can do that.");
  }

  return { id: row.id, email: row.email, name: row.name };
}
