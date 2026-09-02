import {
  bigint,
  boolean,
  index,
  jsonb,
  numeric,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Hand-mirrored from `ld_help_slip`, the schema owned by the standalone
// LD Help Slip app (github.com/harshalilinkd/LD-Help-Slip). Same live rows,
// no copy, no sync — a concern filed there is visible here immediately.
//
// QUERY-ONLY. `drizzle.config.ts` has `schemaFilter: ["ld_erp_core"]`, and
// this repo must never generate or apply a migration against ld_help_slip;
// those belong to the Help Slip repo. If a column here disagrees with the
// database, fix this file — never the database.
//
// ⚠️ Every read and write of these tables must go through `withHelpSlip()`
// in ./rls.ts. Our pool connects as `postgres`, which bypasses RLS, and RLS
// is the ONLY thing separating one employee's concern from another's and
// coordinators without hr_access from confidential ones. Querying these
// tables on a bare connection silently returns everything.
export const helpSlipSchema = pgSchema("ld_help_slip");

// --- enums, as plain text unions -------------------------------------------
// Mirrored as text() rather than pgEnum: we never create these types, and a
// pgEnum here would tempt `drizzle-kit` into trying to manage them.
export const ORGS = ["ld_silk", "linkd", "ld_cotton", "vhagar"] as const;
export type Org = (typeof ORGS)[number];

export const USER_ROLES = ["employee", "pc", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "inactive", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CONCERN_STATUSES = [
  "new",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
] as const;
export type ConcernStatus = (typeof CONCERN_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConcernPriority = (typeof PRIORITIES)[number];

/** `hr_only` is the confidential class — see the warning in ./rls.ts. */
export const VISIBILITIES = ["standard", "hr_only"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const WAIT_REASONS = [
  "awaiting_employee",
  "awaiting_vendor",
  "awaiting_approval",
  "awaiting_parts",
  "other",
] as const;
export type WaitReason = (typeof WAIT_REASONS)[number];

export const UPDATE_TYPES = [
  "status_change",
  "comment",
  "resolution",
  "system",
  "assignment",
] as const;
export type UpdateType = (typeof UPDATE_TYPES)[number];

export const CHANNELS = ["in_app", "email", "sms", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

// --- tables ----------------------------------------------------------------

// `id` is a FK to auth.users — a profile cannot exist without a Supabase Auth
// user, so this app can edit a person but cannot conjure one. See CLAUDE.md.
export const profiles = helpSlipSchema.table("profiles", {
  id: uuid("id").primaryKey(),
  org: text("org").$type<Org>().notNull(),
  employeeCode: text("employee_code"),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  departmentId: uuid("department_id"),
  role: text("role").$type<UserRole>().notNull(),
  hrAccess: boolean("hr_access").notNull(),
  status: text("status").$type<AccountStatus>().notNull(),
  locale: text("locale").notNull(),
  avatarUrl: text("avatar_url"),
  loginId: text("login_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const departments = helpSlipSchema.table("departments", {
  id: uuid("id").primaryKey(),
  org: text("org").$type<Org>().notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameHi: text("name_hi"),
  status: text("status").$type<AccountStatus>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// `concern_number` is assigned by a database trigger — never send one.
export const concerns = helpSlipSchema.table(
  "concerns",
  {
    id: uuid("id").primaryKey(),
    org: text("org").$type<Org>().notNull(),
    concernNumber: text("concern_number").notNull(),
    employeeId: uuid("employee_id").notNull(),
    departmentId: uuid("department_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    priority: text("priority").$type<ConcernPriority>().notNull(),
    status: text("status").$type<ConcernStatus>().notNull(),
    visibility: text("visibility").$type<Visibility>().notNull(),
    waitReason: text("wait_reason").$type<WaitReason>(),
    assignedTo: uuid("assigned_to"),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolutionMessage: text("resolution_message"),
    acceptedSolutionId: uuid("accepted_solution_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    source: text("source").notNull(),
    clientRequestId: uuid("client_request_id"),
    filedForName: text("filed_for_name"),
    // A withdrawn concern is invisible to EVERYONE, including its author —
    // the select policy starts `withdrawn_at IS NULL`. It is a soft withdraw,
    // never a delete; nothing in this app hard-deletes a concern.
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("idx_hs_concerns_employee").on(t.employeeId),
    index("idx_hs_concerns_status").on(t.status),
  ],
);

// The employee's own proposed fixes — up to three, `position` 1..3. This is
// the heart of the paper form and the reason the product exists.
export const concernSolutions = helpSlipSchema.table("concern_solutions", {
  id: uuid("id").primaryKey(),
  concernId: uuid("concern_id").notNull(),
  position: smallint("position").notNull(),
  body: text("body").notNull(),
  proposedBy: uuid("proposed_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// The timeline. `is_internal` marks a coordinator-only note — it must never
// reach an employee, and the RLS policy on this table is what enforces that.
export const concernUpdates = helpSlipSchema.table("concern_updates", {
  id: uuid("id").primaryKey(),
  concernId: uuid("concern_id").notNull(),
  actorId: uuid("actor_id").notNull(),
  updateType: text("update_type").$type<UpdateType>().notNull(),
  message: text("message"),
  isInternal: boolean("is_internal").notNull(),
  oldStatus: text("old_status").$type<ConcernStatus>(),
  newStatus: text("new_status").$type<ConcernStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const concernAttachments = helpSlipSchema.table("concern_attachments", {
  id: uuid("id").primaryKey(),
  concernId: uuid("concern_id").notNull(),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  mimeType: text("mime_type"),
  uploadedBy: uuid("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const notifications = helpSlipSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    concernId: uuid("concern_id"),
    concernUpdateId: uuid("concern_update_id"),
    // Only `in_app` rows belong on screen; whatsapp/sms/email rows on this
    // same table are dispatch records for the edge function.
    channel: text("channel").$type<Channel>().notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    providerResponse: jsonb("provider_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_hs_notifications_user").on(t.userId)],
);

export const accessRequests = helpSlipSchema.table("access_requests", {
  id: uuid("id").primaryKey(),
  org: text("org").$type<Org>().notNull(),
  authUserId: uuid("auth_user_id").notNull(),
  googleEmail: text("google_email").notNull(),
  googleName: text("google_name"),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
});

// Singleton, id = 1, one jsonb blob written wholesale.
export const appSettings = helpSlipSchema.table("app_settings", {
  id: smallint("id").primaryKey(),
  settings: jsonb("settings").$type<HelpSlipSettings>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export type HelpSlipSettings = {
  org_name?: string;
  logo_url?: string;
  default_locale?: "en" | "hi";
  default_theme?: "light" | "dark" | "system";
  sla_days?: { urgent: number; high: number; normal: number; low: number };
  whatsapp_enabled?: boolean;
  quiet_hours?: { from: number; to: number };
};

// NOTE: `dispatch_config` (WhatsApp credentials) is deliberately NOT mirrored.
// It has RLS enabled with zero policies — deny-all to everyone but a
// bypassing role — and nothing on a request path has any business reading it.

// --- views -----------------------------------------------------------------
// `security_invoker` views: they run under the CALLER's permissions, so they
// respect whatever RLS context withHelpSlip() has established. Read concerns
// through v_concerns, never the base table — it pre-computes sla_due_at,
// is_overdue and age_hours and denormalises the department/employee/assignee
// names so no screen has to join.
export const vConcerns = helpSlipSchema.view("v_concerns", {
  id: uuid("id"),
  org: text("org").$type<Org>(),
  concernNumber: text("concern_number"),
  employeeId: uuid("employee_id"),
  departmentId: uuid("department_id"),
  title: text("title"),
  description: text("description"),
  category: text("category"),
  priority: text("priority").$type<ConcernPriority>(),
  status: text("status").$type<ConcernStatus>(),
  visibility: text("visibility").$type<Visibility>(),
  waitReason: text("wait_reason").$type<WaitReason>(),
  assignedTo: uuid("assigned_to"),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolutionMessage: text("resolution_message"),
  acceptedSolutionId: uuid("accepted_solution_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  source: text("source"),
  clientRequestId: uuid("client_request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  employeeName: text("employee_name"),
  employeeCode: text("employee_code"),
  departmentName: text("department_name"),
  departmentNameHi: text("department_name_hi"),
  assignedToName: text("assigned_to_name"),
  assignedToStatus: text("assigned_to_status").$type<AccountStatus>(),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  isOverdue: boolean("is_overdue"),
  ageHours: numeric("age_hours"),
  publicUpdateCount: bigint("public_update_count", { mode: "number" }),
  lastPublicUpdateAt: timestamp("last_public_update_at", { withTimezone: true }),
  filedForName: text("filed_for_name"),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
}).existing();

export const vConcernUpdates = helpSlipSchema.view("v_concern_updates", {
  id: uuid("id"),
  concernId: uuid("concern_id"),
  actorId: uuid("actor_id"),
  actorName: text("actor_name"),
  actorRole: text("actor_role").$type<UserRole>(),
  updateType: text("update_type").$type<UpdateType>(),
  message: text("message"),
  isInternal: boolean("is_internal"),
  oldStatus: text("old_status").$type<ConcernStatus>(),
  newStatus: text("new_status").$type<ConcernStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  acceptedSolutionPosition: smallint("accepted_solution_position"),
}).existing();
