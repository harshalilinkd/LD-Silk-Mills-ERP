import "server-only";

import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { systemAccess, systems, users } from "@/db/schema";
import { pettyCashDb } from "@/db/petty-cash";
import { members } from "@/db/petty-cash/schema";
import type { MemberRole } from "@/db/petty-cash/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Petty Cash: who may open it, and who may move money
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two questions, and BOTH are security boundaries — which is where this module
 * differs from Goods Return, where the second question (which office) is only
 * a mode.
 *
 *   1. MAY THEY OPEN IT?   → `ld_erp_core.system_access`, the tick box in
 *      Settings → Access, read on the SERVER. Hiding a sidebar link is never a
 *      permission.
 *   2. WHAT MAY THEY DO?   → `ld_petty_cash.members.role`. Seeing what the
 *      cash box holds and taking money out of it are not the same permission,
 *      and this is the only module in the ERP where getting that wrong costs
 *      real money.
 *
 * ── WHY A ROLE TABLE AND NOT A CAPABILITY SYSTEM ─────────────────────────
 *
 * The spec asks for five capabilities. This ERP has no capability mechanism to
 * hang them on: `system_access` carries a single `can_view` boolean, and every
 * module keeps its own role table instead — `ld_order_entry.users.role`,
 * `ld_help_slip.profiles.role`, `checklist doers.is_admin`. Inventing a
 * parallel permission system for one module would leave the ERP with two
 * answers to "what may this person do", which is worse than a coarser one.
 *
 * So the five capabilities are expressed as three roles, and the capability
 * NAMES survive as the functions below — `canCreate`, `canDelete` and the
 * rest — so the call sites read as the spec intends and a future capability
 * table would replace their bodies without touching a caller.
 *
 * ── THE ONE EXCEPTION, AND IT IS A BOOTSTRAP, NOT A POLICY ───────────────
 *
 * The spec is explicit that an ERP admin is not automatically a Petty Cash
 * admin. It is right, and this makes the same narrow exception the Checklist
 * makes for the same reason: `members` starts empty, so without it there is
 * nobody who can grant the first role and therefore nobody who ever can.
 *
 * It is one-directional and it is visible: `viaShellAdmin` is true when
 * somebody holds their powers only that way, so the screen can say so rather
 * than letting an ERP administrator quietly believe they were given this.
 */

/** The `system_code` row in `ld_erp_core.systems`. */
export const PETTY_CASH_SYSTEM_CODE = "petty-cash";

export type PettyCashViewer = {
  /** `ld_erp_core.users.id` — the actor on every row this person writes. */
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  /** True when the role comes from being an ERP admin, not from a member row. */
  viaShellAdmin: boolean;
};

/**
 * Null when the signed-in person has not been given Petty Cash, so the layout
 * renders an honest refusal rather than throwing — the contract every other
 * module in this ERP keeps.
 *
 * A system whose `status` is not `active` refuses everybody regardless of the
 * tick, which is what keeps a half-built module invisible.
 */
export async function resolvePettyCashViewer(): Promise<PettyCashViewer | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const [account] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      erpRole: users.role,
    })
    .from(users)
    .innerJoin(systemAccess, eq(systemAccess.userId, users.id))
    .innerJoin(systems, eq(systems.id, systemAccess.systemId))
    .where(
      and(
        eq(users.email, email),
        eq(users.status, "active"),
        eq(systemAccess.canView, true),
        eq(systems.systemCode, PETTY_CASH_SYSTEM_CODE),
        eq(systems.status, "active"),
      ),
    )
    .limit(1);

  if (!account) return null;

  const [member] = await pettyCashDb
    .select({ role: members.role, active: members.active })
    .from(members)
    .where(eq(members.userId, account.userId))
    .limit(1);

  const shellAdmin = account.erpRole === "admin";
  const memberRole = member?.active ? member.role : null;

  return {
    userId: account.userId,
    name: account.name,
    email: account.email,
    // An explicit member row always wins, so an ERP admin can be deliberately
    // limited to VIEWER here and the bootstrap will not quietly override it.
    role: memberRole ?? (shellAdmin ? "ADMIN" : "VIEWER"),
    viaShellAdmin: memberRole === null && shellAdmin,
  };
}

// ─── the capabilities, by name ────────────────────────────────────────────
//
// Pure functions over a resolved viewer. They are the vocabulary the screens
// and the actions both speak, so "who may delete" has exactly one answer.

/**
 * Open the module, read the ledger, the summary and the analysis.
 *
 * Always true for a resolved viewer: holding one at all means `system_access`
 * already said yes. It exists as a named function anyway so the guard below
 * reads like the other four and a future "read is a separate grant" change has
 * one place to happen.
 */
export function canView(): boolean {
  return true;
}

export function canCreate(v: PettyCashViewer): boolean {
  return v.role === "OPERATOR" || v.role === "ADMIN";
}

export function canEdit(v: PettyCashViewer): boolean {
  return v.role === "OPERATOR" || v.role === "ADMIN";
}

/**
 * Deleting is an ADMIN act even though editing is not.
 *
 * An operator correcting their own typo is routine. Removing a payment from
 * the ledger changes the balance and the month's totals, and the soft delete
 * means the row is still there to be argued about afterwards — so it is worth
 * one more person's involvement.
 */
export function canDelete(v: PettyCashViewer): boolean {
  return v.role === "ADMIN";
}

/** Add or edit payees, categories, and other people's roles. */
export function canManageMasters(v: PettyCashViewer): boolean {
  return v.role === "ADMIN";
}

// ─── the guards every mutation calls FIRST ────────────────────────────────
//
// A server action is a POST endpoint. It does not care which page the caller
// was looking at, and hiding a button hides nothing. The screen's own checks
// exist so somebody sees an honest page; these are the boundary.

async function require(
  check: (v: PettyCashViewer) => boolean,
  refusal: string,
): Promise<PettyCashViewer> {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) throw new Error("You do not have access to Petty Cash.");
  if (!check(viewer)) throw new Error(refusal);
  return viewer;
}

export const requirePettyCashViewer = () =>
  require(() => canView(), "You do not have access to Petty Cash.");

export const requirePettyCashCreate = () =>
  require(canCreate, "You do not have permission to add a Petty Cash entry.");

export const requirePettyCashEdit = () =>
  require(canEdit, "You do not have permission to change a Petty Cash entry.");

export const requirePettyCashDelete = () =>
  require(canDelete, "Only a Petty Cash administrator can delete an entry.");

export const requirePettyCashMasters = () =>
  require(canManageMasters, "Only a Petty Cash administrator can do that.");

/** What the browser is told. A mirror of a server decision, never the decision. */
export type PettyCashCapabilities = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  manageMasters: boolean;
};

export function capabilitiesOf(v: PettyCashViewer): PettyCashCapabilities {
  return {
    create: canCreate(v),
    edit: canEdit(v),
    delete: canDelete(v),
    manageMasters: canManageMasters(v),
  };
}
