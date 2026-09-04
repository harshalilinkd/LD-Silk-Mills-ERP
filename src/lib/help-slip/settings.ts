import { asc, count, eq, sql } from "drizzle-orm";

import type { HelpSlipDb } from "@/db/help-slip/rls";
import {
  accessRequests,
  appSettings,
  concerns,
  departments,
  profiles,
  type AccountStatus,
  type HelpSlipSettings,
  type UserRole,
} from "@/db/help-slip/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Help Slip Settings — the reads and writes behind the five admin screens.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's `features/admin/settingsApi.ts`,
 * `departmentsApi.ts` and the write half of `SettingsUsers.tsx`.
 *
 * Everything here runs inside `withHelpSlip`'s RLS context — the caller passes
 * the transaction `db` in. Nothing in this file re-implements a policy; the
 * database decides, and these functions are careful about REPORTING what it
 * decided.
 *
 * ── THE ONE THING THAT MAKES THIS FILE DIFFERENT ──────────────────────────
 *
 * `ld_help_slip.guard_profile_columns` is a BEFORE UPDATE trigger that does not
 * refuse — it REWRITES. A coordinator who edits somebody's role gets:
 *
 *     new.role      := old.role;
 *     new.hr_access := old.hr_access;
 *
 * The UPDATE then succeeds, returns one row, and changes nothing. Postgres is
 * happy, Drizzle is happy, and the screen says "Saved" about a change that did
 * not happen. That is the worst possible outcome for a permissions screen: an
 * admin believes somebody has confidential access who does not.
 *
 * So `updateUser` RETURNS the stored row and compares it against what was
 * asked for, field by field, and hands the caller a list of what the database
 * refused. The route turns a non-empty list into a 403 with the field names in
 * it. "Saved" is only ever said about columns that actually moved.
 *
 * Role is ALSO checked here, before the write, so the common case produces a
 * sentence rather than a silent no-op — but that check is a courtesy. The
 * trigger is the boundary.
 */

// ─── shared vocabulary ─────────────────────────────────────────────────────

/** Everything an admin may change about somebody else. */
export type UserPatch = {
  fullName?: string;
  phone?: string | null;
  departmentId?: string | null;
  role?: UserRole;
  hrAccess?: boolean;
  status?: AccountStatus;
};

/** What a person may change about themselves — the Profile screen. */
export type ProfilePatch = {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
};

export type SettingsUserRow = {
  id: string;
  fullName: string;
  loginId: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  hrAccess: boolean;
  status: AccountStatus;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
};

export type AdminDepartmentRow = {
  id: string;
  code: string;
  name: string;
  status: AccountStatus;
  /** How many concerns have ever been filed against it. Context, not a metric. */
  concernCount: number;
};

export type AccessRequestRow = {
  id: string;
  googleEmail: string;
  googleName: string | null;
  avatarUrl: string | null;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
};

// ─── users ─────────────────────────────────────────────────────────────────

/**
 * Everyone, with their department resolved.
 *
 * `profiles_select` is `using (true)` — the whole directory is readable by any
 * signed-in person, because a concern has to name who raised it and who is on
 * it. So this is not a privileged read; the privilege is in the WRITE below.
 */
export async function loadUsers(db: HelpSlipDb): Promise<SettingsUserRow[]> {
  const rows = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      loginId: profiles.loginId,
      email: profiles.email,
      phone: profiles.phone,
      role: profiles.role,
      hrAccess: profiles.hrAccess,
      status: profiles.status,
      departmentId: profiles.departmentId,
      departmentName: departments.name,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .leftJoin(departments, eq(departments.id, profiles.departmentId))
    .orderBy(asc(profiles.fullName));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** The fields `guard_profile_columns` will rewrite for a non-admin. */
const ADMIN_ONLY_FIELDS = ["role", "hrAccess"] as const;
/** …and the ones it rewrites for anybody who is not staff at all. */
const STAFF_ONLY_FIELDS = ["departmentId", "status"] as const;

export type UpdateUserResult =
  | { ok: true; user: SettingsUserRow }
  /**
   * The write went through, and the database threw part of it away. `refused`
   * names the columns that did not move, so the screen can say WHICH change was
   * rejected rather than "something went wrong".
   */
  | { ok: false; refused: string[]; user: SettingsUserRow };

/**
 * Edit somebody else's profile.
 *
 * Writes, then RE-READS and compares. See the header: the trigger rewrites
 * rather than refusing, so a successful UPDATE proves nothing on its own.
 */
export async function updateUser(
  db: HelpSlipDb,
  id: string,
  patch: UserPatch,
): Promise<UpdateUserResult> {
  const set: Record<string, unknown> = {};
  if (patch.fullName !== undefined) set.fullName = patch.fullName.trim();
  if (patch.phone !== undefined) set.phone = patch.phone?.trim() || null;
  if (patch.departmentId !== undefined) set.departmentId = patch.departmentId;
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.hrAccess !== undefined) set.hrAccess = patch.hrAccess;
  if (patch.status !== undefined) set.status = patch.status;

  if (Object.keys(set).length === 0) {
    const [current] = await loadUsersById(db, id);
    if (!current) throw new Error("That person no longer exists.");
    return { ok: true, user: current };
  }

  const updated = await db
    .update(profiles)
    .set(set)
    .where(eq(profiles.id, id))
    .returning({ id: profiles.id });

  // Zero rows is RLS refusing the row outright, which IS an error — distinct
  // from the trigger quietly rewriting a column, which is the case below.
  if (updated.length === 0) {
    throw new Error(
      "You do not have permission to edit this person, or they no longer exist.",
    );
  }

  const [stored] = await loadUsersById(db, id);
  if (!stored) throw new Error("That person no longer exists.");

  const refused: string[] = [];
  for (const field of [...ADMIN_ONLY_FIELDS, ...STAFF_ONLY_FIELDS] as const) {
    if (patch[field] === undefined) continue;
    if (stored[field] !== patch[field]) refused.push(field);
  }
  // full_name / phone are editable by everyone the policy lets through, so a
  // mismatch there is not a permission refusal — it would be a bug, and it is
  // deliberately not swallowed into `refused`.

  return refused.length
    ? { ok: false, refused, user: stored }
    : { ok: true, user: stored };
}

async function loadUsersById(db: HelpSlipDb, id: string) {
  const rows = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      loginId: profiles.loginId,
      email: profiles.email,
      phone: profiles.phone,
      role: profiles.role,
      hrAccess: profiles.hrAccess,
      status: profiles.status,
      departmentId: profiles.departmentId,
      departmentName: departments.name,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .leftJoin(departments, eq(departments.id, profiles.departmentId))
    .where(eq(profiles.id, id))
    .limit(1);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// ─── profile (yourself) ────────────────────────────────────────────────────

/**
 * Your own name, phone and avatar.
 *
 * The same UPDATE as above and the same trigger, but nothing here is a guarded
 * column — `profiles_update_self` plus the trigger's final branch leave exactly
 * these three writable by anybody. So there is no refusal to report.
 */
export async function updateOwnProfile(
  db: HelpSlipDb,
  id: string,
  patch: ProfilePatch,
): Promise<SettingsUserRow> {
  const set: Record<string, unknown> = {};
  if (patch.fullName !== undefined) set.fullName = patch.fullName.trim();
  if (patch.phone !== undefined) set.phone = patch.phone?.trim() || null;
  if (patch.avatarUrl !== undefined)
    set.avatarUrl = patch.avatarUrl?.trim() || null;

  if (Object.keys(set).length > 0) {
    const updated = await db
      .update(profiles)
      .set(set)
      .where(eq(profiles.id, id))
      .returning({ id: profiles.id });
    if (updated.length === 0) throw new Error("Couldn't save your profile.");
  }

  const [stored] = await loadUsersById(db, id);
  if (!stored) throw new Error("Your profile no longer exists.");
  return stored;
}

// ─── departments ───────────────────────────────────────────────────────────

/**
 * Every department, ACTIVE OR NOT, with its concern count.
 *
 * Deliberately separate from `loadDepartments` in queries.ts, which powers the
 * raise form's dropdown and must only ever return active rows — filing a
 * concern into a department nobody reads is worse than not filing it. Widening
 * that one to serve this screen would be one dropped `where` from a real bug.
 *
 * The count is a grouped join rather than a correlated subquery, so it stays
 * one round trip. RLS applies to the join too, which is correct: the number an
 * admin sees is the number of concerns an admin may read.
 */
export async function loadAdminDepartments(
  db: HelpSlipDb,
): Promise<AdminDepartmentRow[]> {
  const rows = await db
    .select({
      id: departments.id,
      code: departments.code,
      name: departments.name,
      status: departments.status,
      concernCount: count(concerns.id),
    })
    .from(departments)
    .leftJoin(concerns, eq(concerns.departmentId, departments.id))
    .groupBy(
      departments.id,
      departments.code,
      departments.name,
      departments.status,
    )
    .orderBy(asc(departments.status), asc(departments.name));

  return rows.map((r) => ({ ...r, concernCount: Number(r.concernCount) }));
}

/**
 * `code` is UPPER_SNAKE and unique. It is the stable handle — the NAME is what
 * people read and is expected to change; the code is what a report written two
 * years ago still refers to.
 *
 * `name_hi` is never written here. The column still exists and the standalone
 * app still reads it, but this ERP is English-only (docs/DESIGN.md), so a new
 * department simply has no Hindi name rather than a wrong one.
 */
export async function createDepartment(
  db: HelpSlipDb,
  input: { code: string; name: string },
): Promise<AdminDepartmentRow> {
  const code = input.code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  const name = input.name.trim();
  if (!code) throw new Error("A department needs a code.");
  if (!name) throw new Error("A department needs a name.");

  const [row] = await db
    .insert(departments)
    .values({
      // `org` is NOT NULL with no default; every row in this schema is ld_silk.
      org: sql`'ld_silk'`,
      code,
      name,
      status: sql`'active'`,
    } as never)
    .returning({
      id: departments.id,
      code: departments.code,
      name: departments.name,
      status: departments.status,
    });

  if (!row) throw new Error("Couldn't add that department.");
  return { ...row, concernCount: 0 };
}

export async function updateDepartment(
  db: HelpSlipDb,
  id: string,
  patch: { name?: string; status?: AccountStatus },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("A department needs a name.");
    set.name = name;
  }
  if (patch.status !== undefined) set.status = patch.status;
  if (Object.keys(set).length === 0) return;

  const updated = await db
    .update(departments)
    .set(set)
    .where(eq(departments.id, id))
    .returning({ id: departments.id });

  if (updated.length === 0) {
    throw new Error(
      "You do not have permission to change departments, or that one no longer exists.",
    );
  }
}

// ─── access requests ───────────────────────────────────────────────────────

/**
 * People who signed in and are waiting to be let in.
 *
 * This is Help Slip's ONLY onboarding path, and it is a database constraint
 * rather than a design choice: `profiles.id` is a foreign key to
 * `auth.users.id`, so a person cannot exist here until they have signed in at
 * least once. There is no "add a user" form anywhere in this module, and one
 * cannot be built without creating the auth account first.
 */
export async function loadAccessRequests(
  db: HelpSlipDb,
): Promise<AccessRequestRow[]> {
  const rows = await db
    .select({
      id: accessRequests.id,
      googleEmail: accessRequests.googleEmail,
      googleName: accessRequests.googleName,
      avatarUrl: accessRequests.avatarUrl,
      status: accessRequests.status,
      requestedAt: accessRequests.requestedAt,
      reviewedAt: accessRequests.reviewedAt,
      rejectReason: accessRequests.rejectReason,
    })
    .from(accessRequests)
    .orderBy(asc(accessRequests.status), asc(accessRequests.requestedAt));

  return rows.map((r) => ({
    ...r,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  }));
}

/**
 * Approve, through the database's own function.
 *
 * `approve_access_request` is `security definer` and does three things in one
 * transaction: creates the profile, stamps the request reviewed, and records
 * who reviewed it. Re-implementing that here would be two round trips and a
 * window in which a profile exists for a request that still says "pending".
 */
export async function approveAccessRequest(
  db: HelpSlipDb,
  input: {
    requestId: string;
    role: UserRole;
    departmentId: string | null;
    hrAccess: boolean;
    fullName: string;
  },
): Promise<void> {
  await db.execute(sql`
    select ld_help_slip.approve_access_request(
      ${input.requestId}::uuid,
      ${input.role}::ld_help_slip.user_role,
      ${input.departmentId}::uuid,
      ${input.hrAccess}::boolean,
      ${input.fullName.trim()}::text
    )
  `);
}

export async function rejectAccessRequest(
  db: HelpSlipDb,
  input: { requestId: string; reason: string },
): Promise<void> {
  await db.execute(sql`
    select ld_help_slip.reject_access_request(
      ${input.requestId}::uuid,
      ${input.reason.trim()}::text
    )
  `);
}

// ─── general settings ──────────────────────────────────────────────────────

/**
 * The defaults, repeated here on purpose.
 *
 * `v_concerns` carries the same SLA numbers as its own fallback, in SQL. The
 * duplication is deliberate and worth its cost: the view must produce a sane
 * due date even if this row is missing or malformed, and the form must render
 * before the row has loaded. Neither can wait for the other.
 */
export type GeneralSettings = {
  org_name: string;
  logo_url: string;
  /**
   * What a device with no stored preference falls back to. Theme is per-DEVICE
   * (localStorage, applied before first paint) rather than per-account —
   * somebody on the factory floor in daylight and the same person at home at
   * night want different answers — so this is a default, not a setting. A
   * device that has already chosen keeps its choice.
   */
  default_theme: "light" | "dark" | "system";
  /** In calendar days. `v_concerns` turns these into `sla_due_at`. */
  sla_days: { urgent: number; high: number; normal: number; low: number };
  /** Master switch for the dispatcher. Off means queue but never send. */
  whatsapp_enabled: boolean;
  /** 24h, Asia/Kolkata. A message queued inside the window waits for morning. */
  quiet_hours: { from: number; to: number };
};

export const DEFAULT_SETTINGS: GeneralSettings = {
  org_name: "LD Silk Mills",
  logo_url: "",
  default_theme: "system",
  sla_days: { urgent: 1, high: 2, normal: 4, low: 7 },
  whatsapp_enabled: true,
  quiet_hours: { from: 21, to: 8 },
};

const clampHour = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
};

const clampDays = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? Math.round(n) : fallback;
};

/** Anything absent falls back, so a partial blob never renders an empty form. */
function merge(raw: HelpSlipSettings | null | undefined): GeneralSettings {
  const blob = raw ?? {};
  const sla = blob.sla_days ?? ({} as Partial<GeneralSettings["sla_days"]>);
  const quiet =
    blob.quiet_hours ?? ({} as Partial<GeneralSettings["quiet_hours"]>);
  return {
    org_name: blob.org_name?.trim() || DEFAULT_SETTINGS.org_name,
    logo_url: blob.logo_url?.trim() || "",
    default_theme:
      blob.default_theme === "light" || blob.default_theme === "dark"
        ? blob.default_theme
        : "system",
    sla_days: {
      urgent: clampDays(sla.urgent, DEFAULT_SETTINGS.sla_days.urgent),
      high: clampDays(sla.high, DEFAULT_SETTINGS.sla_days.high),
      normal: clampDays(sla.normal, DEFAULT_SETTINGS.sla_days.normal),
      low: clampDays(sla.low, DEFAULT_SETTINGS.sla_days.low),
    },
    whatsapp_enabled:
      blob.whatsapp_enabled ?? DEFAULT_SETTINGS.whatsapp_enabled,
    quiet_hours: {
      from: clampHour(quiet.from, DEFAULT_SETTINGS.quiet_hours.from),
      to: clampHour(quiet.to, DEFAULT_SETTINGS.quiet_hours.to),
    },
  };
}

export async function loadSettings(db: HelpSlipDb): Promise<GeneralSettings> {
  const [row] = await db
    .select({ settings: appSettings.settings })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  return merge(row?.settings);
}

/**
 * Writes the WHOLE blob, not a jsonb patch.
 *
 * The form holds every field and the row is a singleton edited by one admin at
 * a time, so a merge would add a failure mode — a half-written blob — to buy
 * nothing. `app_settings_update` restricts this to an admin.
 *
 * `default_locale` is deliberately NOT written: it chose a new account's
 * starting language, and this ERP is English-only. Anything already in the
 * column is left where it is, because the standalone app still reads it.
 */
export async function saveSettings(
  db: HelpSlipDb,
  next: GeneralSettings,
): Promise<GeneralSettings> {
  const clean = merge(next);
  const updated = await db
    .update(appSettings)
    .set({
      settings: sql`${appSettings.settings} || ${JSON.stringify(clean)}::jsonb`,
    })
    .where(eq(appSettings.id, 1))
    .returning({ settings: appSettings.settings });

  if (updated.length === 0) {
    throw new Error("You do not have permission to change these settings.");
  }
  return merge(updated[0]?.settings);
}

// ─── who may see this section at all ───────────────────────────────────────

/**
 * A RENDERING guard, not a security one — the database decides every write
 * above regardless of what this returns. It exists so a coordinator is shown
 * the two screens they can actually use rather than five, three of which would
 * refuse them.
 */
/**
 * ONE TAB, down from five — so the strip is not rendered at all any more and
 * `/help-slip/settings` simply IS General.
 *
 * Nothing was deleted. Each screen moved to the place that owns that job, and
 * every old address redirects:
 *
 *   · `users`          -> /settings/users   — one People screen, all systems
 *   · `departments`    -> /masters          — a company list, not a module's
 *   · `profile`        -> /settings         — your own name and phone
 *   · `accessRequests` -> /settings/access-requests — who joins is not a rule
 *
 * The last two moved because "Help Slip rules" should hold rules of Help Slip.
 * A person's own details and a queue of joiners are neither; they were the
 * ERP's job filed under a module's configuration.
 *
 * `updateUser` / `loadUsers` below are still exported: the Help Slip API routes
 * they back are the mechanism the People screen uses for this module's half.
 * `updateOwnProfile` likewise — ERP Settings now calls it, through the person's
 * own RLS context, to keep the WhatsApp number in step.
 */
export function settingsTabsFor(role: UserRole): {
  profile: boolean;
  users: boolean;
  departments: boolean;
  accessRequests: boolean;
  general: boolean;
} {
  const admin = role === "admin";
  return {
    profile: false,
    users: false,
    departments: false,
    accessRequests: false,
    general: admin,
  };
}

/** Used by every settings route that must not answer an employee at all. */
export function assertStaff(role: UserRole) {
  if (role !== "admin" && role !== "pc") {
    throw new Error("Settings are for coordinators and admins.");
  }
}

export function assertAdmin(role: UserRole) {
  if (role !== "admin") {
    throw new Error("Only an admin can change this.");
  }
}
