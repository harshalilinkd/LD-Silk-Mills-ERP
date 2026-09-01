import { asc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { systems, users, systemAccess, auditLogs } from "@/db/schema";

export async function getAllSystemsOrdered() {
  return db.select().from(systems).orderBy(asc(systems.sortOrder));
}

/** Systems visible to a given user: active systems they have can_view=true for. */
export async function getVisibleSystemsForUser(userId: string) {
  return db
    .select({ system: systems })
    .from(systemAccess)
    .innerJoin(systems, eq(systemAccess.systemId, systems.id))
    .where(and(eq(systemAccess.userId, userId), eq(systemAccess.canView, true)))
    .orderBy(asc(systems.sortOrder))
    .then((rows) => rows.map((r) => r.system));
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
