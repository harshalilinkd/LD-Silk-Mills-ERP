import { asc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { systems, users, systemAccess, auditLogs } from "@/db/schema";

export async function getAllSystemsOrdered() {
  return db.select().from(systems).orderBy(asc(systems.sortOrder));
}

/**
 * Systems to render in a given user's sidebar: every non-active system
 * (coming_soon / maintenance) is shown to everyone as a preview — it isn't
 * a real destination yet, so per-user access doesn't apply to it. Active
 * systems are shown only if the user has an explicit can_view=true row in
 * system_access — that's what actually gates visibility once a system is
 * live.
 */
export async function getVisibleSystemsForUser(userId: string) {
  const [allSystems, accessRows] = await Promise.all([
    getAllSystemsOrdered(),
    db
      .select({ systemId: systemAccess.systemId })
      .from(systemAccess)
      .where(and(eq(systemAccess.userId, userId), eq(systemAccess.canView, true))),
  ]);

  const accessible = new Set(accessRows.map((r) => r.systemId));

  return allSystems.filter(
    (system) => system.status !== "active" || accessible.has(system.id),
  );
}

export async function getAllUsersOrdered() {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function getUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function getUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getSystemAccessMatrix() {
  const [allUsers, allSystems, allAccess] = await Promise.all([
    getAllUsersOrdered(),
    getAllSystemsOrdered(),
    db.select().from(systemAccess),
  ]);

  const accessByPair = new Map(
    allAccess.map((row) => [`${row.userId}:${row.systemId}`, row.canView]),
  );

  return { allUsers, allSystems, accessByPair };
}

export async function getRecentAuditLogs(limit = 50) {
  return db
    .select()
    .from(auditLogs)
    .orderBy(auditLogs.createdAt)
    .limit(limit);
}

export async function getDashboardCounts() {
  const [allSystems, allUsers] = await Promise.all([
    db.select().from(systems),
    db.select().from(users),
  ]);
  return {
    activeSystems: allSystems.filter((s) => s.status === "active").length,
    totalSystems: allSystems.length,
    totalUsers: allUsers.length,
    systems: allSystems.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}
