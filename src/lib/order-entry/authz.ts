// Replaces Order Entry's lib/auth.ts for this module. There is no second
// login here — a user is already authenticated at the shell level (Google,
// or the temporary dev-password login). This only answers: "does this
// person's email have an active row in ld_order_entry.users, and if so,
// what can they do?" `capsForRole` is ported verbatim from Order Entry's
// lib/auth.ts (same role_permissions table, same DEFAULT_ROLE_CAPS
// fallback), since the two apps read the exact same live table.
import { eq } from "drizzle-orm";
import { orderEntryDb } from "@/db/order-entry";
import { rolePermissions, users } from "@/db/order-entry/schema";
import {
  CAPABILITY_KEYS,
  DEFAULT_ROLE_CAPS,
  type Capability,
  type Role,
} from "./rbac";

export type OrderEntryAuthz = {
  userId: string;
  name: string | null;
  role: Role;
  caps: Capability[];
};

async function capsForRole(role: Role): Promise<Capability[]> {
  if (role === "ADMIN") return [...CAPABILITY_KEYS];
  try {
    const rows = await orderEntryDb
      .select({
        capability: rolePermissions.capability,
        allowed: rolePermissions.allowed,
      })
      .from(rolePermissions)
      .where(eq(rolePermissions.role, role));
    if (rows.length === 0) return [...DEFAULT_ROLE_CAPS[role]];
    return rows
      .filter((r) => r.allowed)
      .map((r) => r.capability)
      .filter((c): c is Capability => (CAPABILITY_KEYS as string[]).includes(c));
  } catch {
    return [...DEFAULT_ROLE_CAPS[role]];
  }
}

/**
 * Looks up the given (already shell-authenticated) email in
 * ld_order_entry.users. Returns null if there's no active account there —
 * the caller should show a "not provisioned for Order Entry" screen, same
 * pattern as the shell's own /not-registered.
 */
export async function resolveOrderEntryAuthz(
  email: string,
): Promise<OrderEntryAuthz | null> {
  const [dbUser] = await orderEntryDb
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!dbUser || !dbUser.isActive) return null;

  return {
    userId: dbUser.id,
    name: dbUser.name,
    role: dbUser.role as Role,
    caps: await capsForRole(dbUser.role as Role),
  };
}
