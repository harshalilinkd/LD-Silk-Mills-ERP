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

/**
 * How many people can actually SEE each system.
 *
 * This exists because of a trap that cost a real afternoon: a system that is
 * `coming_soon` is shown to EVERYONE as a greyed preview, and the moment an
 * admin switches it to `active` it becomes visible only to people with an
 * explicit `can_view` row. So marking a system live makes it VANISH from the
 * sidebar of everybody who has not been ticked — including the admin who just
 * marked it live, who then reasonably concludes the switch did not work.
 *
 * The rule itself is right: an active system is a real destination and should
 * be granted deliberately. What was wrong is that the registry said "Active"
 * and said nothing about nobody being able to reach it. The count is rendered
 * beside the status so the gap is visible at the moment it is created.
 */
export async function getSystemViewerCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({ systemId: systemAccess.systemId, canView: systemAccess.canView })
    .from(systemAccess)
    .where(eq(systemAccess.canView, true));

  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.systemId, (counts.get(r.systemId) ?? 0) + 1);
  }
  return counts;
}

/**
 * THE COLUMNS A USER ROW IS ALLOWED TO LEAVE THE SERVER WITH.
 *
 * Every one of these three functions used `db.select().from(users)` — all
 * columns. That was harmless until `password_hash` was added, and then it was
 * not: `getAllUsersOrdered` feeds `/admin/users`, which hands each row to a
 * Client Component, so React would have serialised every bcrypt hash into the
 * HTML delivered to the browser. A hash in a page source is an offline
 * cracking target, and nothing on that screen needs it.
 *
 * So the columns are listed, and `passwordHash` is not among them. The ONLY
 * place that column is read is the `password` provider in `src/auth.ts`, which
 * selects it by name. `passwordSetAt` is safe and useful — it lets the admin
 * screen say whether somebody has a password without revealing anything about
 * it.
 *
 * Add a column here only after asking whether the browser needs it.
 */
const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatar: users.avatar,
  phone: users.phone,
  status: users.status,
  role: users.role,
  passwordSetAt: users.passwordSetAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

export type PublicUser = {
  [K in keyof typeof publicUserColumns]: (typeof users)["$inferSelect"][K];
};

export async function getAllUsersOrdered() {
  return db.select(publicUserColumns).from(users).orderBy(asc(users.name));
}

export async function getUserByEmail(email: string) {
  const [row] = await db
    .select(publicUserColumns)
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function getUserById(id: string) {
  const [row] = await db
    .select(publicUserColumns)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
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
