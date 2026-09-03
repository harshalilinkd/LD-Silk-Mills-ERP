import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * The Supabase project ("LD Silk Mills", ygxnbmfmrwookrilpbfx) is shared
 * across every LD module, each in its own Postgres schema
 * (ld_order_entry, ld_help_slip, ...). This app's tables live in
 * ld_erp_core — never in `public`, and never reachable from another
 * module's schema.
 */
export const ldErpCore = pgSchema("ld_erp_core");

export const userStatusEnum = ldErpCore.enum("user_status", [
  "active",
  "inactive",
]);

/**
 * WHO MAY ADMINISTER THE SHELL ITSELF.
 *
 * This did not exist until now, and its absence was a live privilege
 * escalation: `/admin/users`, `/admin/system-registry` and
 * `/admin/access-control` were reachable by any signed-in person, and their
 * three server actions carried no check at all. Anyone could grant themselves
 * access to any module, or edit any account.
 *
 * Note this is the SHELL's role and nothing else. It does not decide anything
 * inside a module: Order Entry resolves its own role from
 * `ld_order_entry.users`, Help Slip from `ld_help_slip.profiles`. A shell
 * admin is not automatically an Order Entry admin, and should not be — the
 * person who manages accounts is not necessarily the person allowed to delete
 * an order.
 */
export const userRoleEnum = ldErpCore.enum("user_role", ["member", "admin"]);

export const systemCategoryEnum = ldErpCore.enum("system_category", [
  "sales",
  "operations",
  "finance",
  "reports",
  "admin",
]);

export const systemStatusEnum = ldErpCore.enum("system_status", [
  "active",
  "coming_soon",
  "maintenance",
]);

export const openModeEnum = ldErpCore.enum("open_mode", [
  "internal",
  "external",
]);

export const users = ldErpCore.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull().unique(),
  avatar: text("avatar"),
  status: userStatusEnum("status").notNull().default("active"),
  /** Shell administration only — see userRoleEnum. Defaults to the safe value. */
  role: userRoleEnum("role").notNull().default("member"),
  /**
   * bcrypt hash, cost 10 — the same cost `ld_order_entry.users` uses, so the
   * two apps' hashes are comparable in strength and neither surprises the
   * other.
   *
   * NULLABLE, and that is the design: somebody who only ever signs in with
   * Google has no password, and "no password" must be distinguishable from
   * "empty password". Every read of this column is server-side only — it is
   * never selected into a page payload, never returned by an action, and never
   * logged. `getAllUsersOrdered` selects columns explicitly for that reason.
   */
  passwordHash: text("password_hash"),
  /** When it was last set, so the admin screen can say "set 3 days ago". */
  passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systems = ldErpCore.table("systems", {
  id: uuid("id").primaryKey().defaultRandom(),
  systemCode: varchar("system_code").notNull().unique(),
  systemName: varchar("system_name").notNull(),
  category: systemCategoryEnum("category").notNull(),
  description: text("description"),
  icon: varchar("icon"),
  route: varchar("route"),
  applicationUrl: text("application_url"),
  status: systemStatusEnum("status").notNull().default("coming_soon"),
  openMode: openModeEnum("open_mode").notNull().default("external"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemAccess = ldErpCore.table(
  "system_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    systemId: uuid("system_id")
      .notNull()
      .references(() => systems.id),
    canView: boolean("can_view").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.systemId)],
);

export const auditLogs = ldErpCore.table("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action").notNull(),
  systemCode: varchar("system_code"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type System = typeof systems.$inferSelect;
export type NewSystem = typeof systems.$inferInsert;
export type SystemAccess = typeof systemAccess.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
