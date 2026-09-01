import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const systemCategoryEnum = pgEnum("system_category", [
  "sales",
  "operations",
  "finance",
  "reports",
  "admin",
]);

export const systemStatusEnum = pgEnum("system_status", [
  "active",
  "coming_soon",
  "maintenance",
]);

export const openModeEnum = pgEnum("open_mode", ["internal", "external"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull().unique(),
  avatar: text("avatar"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systems = pgTable("systems", {
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

export const systemAccess = pgTable(
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

export const auditLogs = pgTable("audit_logs", {
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
