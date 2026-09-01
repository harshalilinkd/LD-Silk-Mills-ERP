// Ported from github.com/mastersystem-linkd/LD-Order-Entry (db/schema.ts).
// This mirrors Order Entry's OWN schema exactly — same live tables in the
// shared Supabase project, same 15 tables, same columns. This file is for
// QUERYING only: drizzle.config.ts's schemaFilter stays ["ld_erp_core"], so
// `db:generate`/`db:migrate` in this repo never touches ld_order_entry.
// Migrations for this schema are owned by the Order Entry repo, not here.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const orderEntrySchema = pgSchema("ld_order_entry");

export const userRole = orderEntrySchema.enum("user_role", [
  "ADMIN",
  "SALES",
  "OPS",
  "VIEWER",
  "CRM",
]);

export const rolePermissions = orderEntrySchema.table("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: userRole("role").notNull(),
  capability: varchar("capability", { length: 40 }).notNull(),
  allowed: boolean("allowed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = orderEntrySchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  name: varchar("name", { length: 200 }),
  role: userRole("role").notNull().default("VIEWER"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const crrCustomers = orderEntrySchema.table("crr_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: integer("customer_id").notNull(),
  alias: varchar("alias", { length: 120 }),
  fullRawName: varchar("full_raw_name", { length: 250 }).notNull(),
  displayName: varchar("display_name", { length: 250 }).notNull(),
  canon: varchar("canon", { length: 250 }).notNull(),
  tight: varchar("tight", { length: 250 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customerOrders = orderEntrySchema.table(
  "customer_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: varchar("order_no", { length: 50 }).notNull().unique(),
    orderDate: date("order_date").notNull(),
    partyName: varchar("party_name", { length: 200 }).notNull(),
    salesPerson: varchar("sales_person", { length: 100 }),
    agent: varchar("agent", { length: 120 }),
    haste: varchar("haste", { length: 120 }),
    transport: varchar("transport", { length: 120 }),
    challanNo: varchar("challan_no", { length: 100 }),
    lotNo: varchar("lot_no", { length: 100 }),
    department: varchar("department", { length: 40 }).notNull().default("LD"),
    remarks: text("remarks"),
    createdBy: varchar("created_by", { length: 120 }),
    crrCustomerId: integer("crr_customer_id"),
    partyNameOriginal: varchar("party_name_original", { length: 200 }),
    hasteOriginal: varchar("haste_original", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_customer_orders_party_name").on(t.partyName),
    index("idx_customer_orders_order_date").on(t.orderDate),
    index("idx_customer_orders_crr_customer").on(t.crrCustomerId),
  ],
);

export const orderLineItems = orderEntrySchema.table(
  "order_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => customerOrders.id, { onDelete: "cascade" }),
    quality: varchar("quality", { length: 100 }).notNull(),
    designNo: varchar("design_no", { length: 100 }).notNull(),
    qtyMtr: numeric("qty_mtr", { precision: 10, scale: 2 }).notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }),
    lineTotal: numeric("line_total", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`qty_mtr * rate`),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_order_line_items_order_id").on(t.orderId),
    index("idx_order_line_items_quality_design").on(t.quality, t.designNo),
  ],
);

export const workflowStages = orderEntrySchema.table("workflow_stages", {
  stageKey: varchar("stage_key", { length: 40 }).primaryKey(),
  label: varchar("label", { length: 60 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  plannedOffsetDays: integer("planned_offset_days").notNull().default(1),
});

export const lineStageProgress = orderEntrySchema.table(
  "line_stage_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderLineItemId: uuid("order_line_item_id")
      .notNull()
      .references(() => orderLineItems.id, { onDelete: "cascade" }),
    stageKey: varchar("stage_key", { length: 40 })
      .notNull()
      .references(() => workflowStages.stageKey),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    isDone: boolean("is_done").notNull().default(false),
    delayMinutes: integer("delay_minutes"),
    stockStatus: varchar("stock_status", { length: 20 }),
    updatedBy: varchar("updated_by", { length: 120 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_line_stage_progress_line_stage").on(
      t.orderLineItemId,
      t.stageKey,
    ),
    index("idx_line_stage_progress_line").on(t.orderLineItemId),
  ],
);

export const designDatabase = orderEntrySchema.table(
  "design_database",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    orderId: uuid("order_id").references(() => customerOrders.id, {
      onDelete: "set null",
    }),
    orderNo: varchar("order_no", { length: 50 }).notNull(),
    fabricName: varchar("fabric_name", { length: 100 }).notNull(),
    designNo: varchar("design_no", { length: 100 }).notNull(),
  },
  (t) => [
    index("idx_design_database_fabric").on(t.fabricName),
    index("idx_design_database_design").on(t.designNo),
  ],
);

export const lookupValues = orderEntrySchema.table(
  "lookup_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: varchar("category", { length: 30 }).notNull(),
    value: varchar("value", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    crrCustomerId: integer("crr_customer_id"),
  },
  (t) => [
    index("idx_lookup_values_category").on(t.category),
    index("idx_lookup_values_crr_customer").on(t.crrCustomerId),
    uniqueIndex("uq_lookup_values_category_value").on(t.category, t.value),
  ],
);

export const LOOKUP_CATEGORIES = [
  "PARTY",
  "SALES_PERSON",
  "AGENT",
  "HASTE",
  "TRANSPORT",
  "FABRIC",
  "CRM_ISSUE",
  "CRM_DEPT",
  "CRM_DELAY_REASON",
] as const;
export type LookupCategory = (typeof LOOKUP_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// CRM tables — not queried by this phase's UI yet, kept here so phase 3c
// (CRM module) doesn't need a schema change.
// ---------------------------------------------------------------------------

export const crmFollowups = orderEntrySchema.table(
  "crm_followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => customerOrders.id, { onDelete: "cascade" }),
    orderNo: varchar("order_no", { length: 50 }).notNull(),
    crrCustomerId: integer("crr_customer_id"),
    status: varchar("status", { length: 20 }).notNull().default("DUE"),
    deliveryBasis: varchar("delivery_basis", { length: 20 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    contactPerson: varchar("contact_person", { length: 120 }),
    contactPhone: varchar("contact_phone", { length: 30 }),
    systemOnTime: boolean("system_on_time"),
    customerSaysOnTime: boolean("customer_says_on_time"),
    delayReason: varchar("delay_reason", { length: 30 }),
    ratingOverall: smallint("rating_overall"),
    ratingSource: varchar("rating_source", { length: 20 }),
    reorderIntent: varchar("reorder_intent", { length: 20 })
      .notNull()
      .default("none"),
    reorderNote: text("reorder_note"),
    deliveredLineIds: jsonb("delivered_line_ids"),
    attemptCount: integer("attempt_count").notNull().default(0),
    notes: text("notes"),
    isEscalated: boolean("is_escalated").notNull().default(false),
    createdBy: varchar("created_by", { length: 120 }),
    completedBy: varchar("completed_by", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_crm_followups_order").on(t.orderId),
    index("idx_crm_followups_status").on(t.status),
    index("idx_crm_followups_due_at").on(t.dueAt),
    check(
      "ck_crm_followups_completed_rating",
      sql`status <> 'COMPLETED' OR rating_overall IS NOT NULL`,
    ),
  ],
);

export const crmFollowupAttempts = orderEntrySchema.table(
  "crm_followup_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followupId: uuid("followup_id")
      .notNull()
      .references(() => crmFollowups.id, { onDelete: "cascade" }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    channel: varchar("channel", { length: 20 }).notNull(),
    outcome: varchar("outcome", { length: 30 }).notNull(),
    attendedBy: varchar("attended_by", { length: 120 }),
    note: text("note"),
    createdBy: varchar("created_by", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_crm_followup_attempts_followup").on(t.followupId)],
);

export const crmIssues = orderEntrySchema.table(
  "crm_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followupId: uuid("followup_id")
      .notNull()
      .references(() => crmFollowups.id, { onDelete: "cascade" }),
    orderId: uuid("order_id"),
    orderLineItemId: uuid("order_line_item_id").references(
      () => orderLineItems.id,
      { onDelete: "set null" },
    ),
    quality: varchar("quality", { length: 100 }),
    designNo: varchar("design_no", { length: 100 }),
    category: varchar("category", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull(),
    qtyAffected: numeric("qty_affected", { precision: 10, scale: 2 }),
    description: text("description"),
    ownerDept: varchar("owner_dept", { length: 30 }),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    resolution: varchar("resolution", { length: 30 }),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: varchar("resolved_by", { length: 120 }),
    createdBy: varchar("created_by", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_crm_issues_status").on(t.status),
    index("idx_crm_issues_owner_dept").on(t.ownerDept),
    index("idx_crm_issues_order").on(t.orderId),
    index("idx_crm_issues_followup").on(t.followupId),
  ],
);

export const crmRatingCriteria = orderEntrySchema.table(
  "crm_rating_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 40 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    hint: varchar("hint", { length: 160 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_crm_rating_criteria_key").on(t.key)],
);

export const crmFollowupRatings = orderEntrySchema.table(
  "crm_followup_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followupId: uuid("followup_id")
      .notNull()
      .references(() => crmFollowups.id, { onDelete: "cascade" }),
    criterionKey: varchar("criterion_key", { length: 40 }).notNull(),
    value: smallint("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_crm_followup_ratings").on(t.followupId, t.criterionKey),
    check("ck_crm_followup_ratings_value", sql`value between 1 and 5`),
  ],
);

export const crmSettings = orderEntrySchema.table("crm_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  transitDaysDefault: integer("transit_days_default").notNull().default(3),
  followupDueDays: integer("followup_due_days").notNull().default(2),
  maxAttempts: integer("max_attempts").notNull().default(3),
  escalateRatingAt: smallint("escalate_rating_at").notNull().default(2),
  autoCreateFollowups: boolean("auto_create_followups")
    .notNull()
    .default(true),
  transportTransitDays: jsonb("transport_transit_days"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OeUser = typeof users.$inferSelect;
export type CustomerOrder = typeof customerOrders.$inferSelect;
export type OrderLineItem = typeof orderLineItems.$inferSelect;
export type WorkflowStage = typeof workflowStages.$inferSelect;
export type LineStageProgress = typeof lineStageProgress.$inferSelect;
export type LookupValue = typeof lookupValues.$inferSelect;
export type DesignDatabaseRow = typeof designDatabase.$inferSelect;
export type CrrCustomer = typeof crrCustomers.$inferSelect;
