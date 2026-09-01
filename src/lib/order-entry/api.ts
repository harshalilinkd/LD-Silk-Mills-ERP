// Replaces Order Entry's lib/api.ts guards. Same guard shapes/behavior, but
// the "session user" is resolved from the SHELL's session (Google/dev-login)
// + a live ld_order_entry.users lookup (resolveOrderEntryAuthz), not from a
// second Order-Entry-specific login.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "./authz";
import { hasCap, type Capability, type Role } from "./rbac";

export type SessionUser = {
  id: string;
  role: Role;
  caps: Capability[];
  email?: string | null;
  name?: string | null;
};

export function jsonData(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}
export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export type Guard =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

async function currentOrderEntryUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const authz = await resolveOrderEntryAuthz(session.user.email);
  if (!authz) return null;
  return {
    id: authz.userId,
    role: authz.role,
    caps: authz.caps,
    email: session.user.email,
    name: authz.name,
  };
}

export async function requireRole(roles: Role[]): Promise<Guard> {
  const user = await currentOrderEntryUser();
  if (!user) return { ok: false, response: jsonError("Unauthorized", 401) };
  if (!roles.includes(user.role)) {
    return { ok: false, response: jsonError("Forbidden", 403) };
  }
  return { ok: true, user };
}

export async function requireCapability(cap: Capability): Promise<Guard> {
  const user = await currentOrderEntryUser();
  if (!user) return { ok: false, response: jsonError("Unauthorized", 401) };
  if (user.role !== "ADMIN" && !hasCap(user.caps, cap)) {
    return { ok: false, response: jsonError("Forbidden", 403) };
  }
  return { ok: true, user };
}

export async function requireAnyCapability(caps: Capability[]): Promise<Guard> {
  const user = await currentOrderEntryUser();
  if (!user) return { ok: false, response: jsonError("Unauthorized", 401) };
  if (user.role !== "ADMIN" && !caps.some((c) => hasCap(user.caps, c))) {
    return { ok: false, response: jsonError("Forbidden", 403) };
  }
  return { ok: true, user };
}

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}
