import "server-only";

import { sql as raw } from "@/db";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  One person, three systems
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The ERP kept three separate staff lists and a screen for each: ERP accounts,
 * Order Entry accounts, and Help Slip profiles. Adding a joiner meant three
 * screens in three places, so people were added to one and forgotten in the
 * others — measured before this was written, there were 14 records for what
 * should have been one team, and exactly ONE person existed in all three.
 *
 * This module is the join. Everything is keyed on the EMAIL, lower-cased,
 * because that is the only thing the three tables genuinely share — their ids
 * are unrelated and always will be.
 *
 * ── WHY THE TABLES ARE NOT MERGED ─────────────────────────────────────────
 *
 * They cannot be, and the reasons are structural rather than tidiness:
 *
 *   · `ld_order_entry.users` is SHARED LIVE with the standalone Order Entry
 *     app. We add and update rows; we never restructure it and never delete
 *     from it. Deactivating sets `is_active = false`, which is what that app
 *     already understands.
 *   · `ld_help_slip.profiles.id` is a foreign key to `auth.users(id)` — the
 *     Supabase Auth table. A profile cannot exist without a sign-in record, so
 *     creating a Help Slip person is a TWO-STEP operation, done below.
 *
 * ── THE RLS EXCEPTION, STATED PLAINLY ─────────────────────────────────────
 *
 * CLAUDE.md says Help Slip's boundary is RLS and that `unsafeLookupProfileByEmail`
 * is the only read allowed to bypass it. This file adds the second exception,
 * deliberately, and it is the only other one:
 *
 *   An ERP administrator managing staff is acting on the system, not inside
 *   it. They may have no Help Slip profile at all — a shell admin who never
 *   raises concerns — so there is no `auth.uid()` to run as, and
 *   `withHelpSlip` has nothing to stand on. Every function here is therefore
 *   called only from a server action that has already run `requireErpAdmin()`.
 *
 * If you add a function to this file, it MUST be admin-gated by its caller.
 * Nothing here may ever be reachable from a normal request path.
 */

export type ErpRole = "member" | "admin";
export type OrderEntryRole = "ADMIN" | "SALES" | "OPS" | "VIEWER" | "CRM";
export type HelpSlipRole = "employee" | "pc" | "admin";

export type Person = {
  email: string;
  name: string;

  /** ld_erp_core — the anchor. Null means they can't sign in to the ERP. */
  erpId: string | null;
  erpRole: ErpRole | null;
  erpStatus: "active" | "inactive" | null;
  hasPassword: boolean;

  /** ld_order_entry — shared with the live standalone app. */
  orderEntryRole: OrderEntryRole | null;
  orderEntryActive: boolean;

  /** ld_help_slip — needs a Supabase Auth record underneath. */
  helpSlipRole: HelpSlipRole | null;
  helpSlipStatus: string | null;
  helpSlipHrAccess: boolean;
  helpSlipDepartmentId: string | null;
};

export type Department = { id: string; name: string };

/**
 * Every person known to any of the three systems, merged.
 *
 * A LEFT JOIN chain from a union of the three email lists, so somebody who
 * exists in only one still appears — which is the entire point. Before this,
 * an Order Entry admin with no ERP account was invisible to every screen.
 */
export async function loadPeople(): Promise<Person[]> {
  const rows = await raw<
    Array<{
      email: string;
      name: string | null;
      erp_id: string | null;
      erp_role: ErpRole | null;
      erp_status: "active" | "inactive" | null;
      has_password: boolean | null;
      oe_role: OrderEntryRole | null;
      oe_active: boolean | null;
      hs_role: HelpSlipRole | null;
      hs_status: string | null;
      hs_hr: boolean | null;
      hs_dept: string | null;
    }>
  >`
    with everyone as (
      select lower(email) as email from ld_erp_core.users
      union
      select lower(email) from ld_order_entry.users
      union
      select lower(login_id) from ld_help_slip.profiles
    )
    select e.email,
           coalesce(c.name, o.name, p.full_name)      as name,
           c.id                                        as erp_id,
           c.role::text                                as erp_role,
           c.status::text                              as erp_status,
           (c.password_hash is not null)               as has_password,
           o.role::text                                as oe_role,
           o.is_active                                 as oe_active,
           p.role::text                                as hs_role,
           p.status::text                              as hs_status,
           p.hr_access                                 as hs_hr,
           p.department_id::text                       as hs_dept
    from everyone e
    left join ld_erp_core.users    c on lower(c.email)    = e.email
    left join ld_order_entry.users o on lower(o.email)    = e.email
    left join ld_help_slip.profiles p on lower(p.login_id) = e.email
    order by coalesce(c.name, o.name, p.full_name), e.email
  `;

  return rows.map((r) => ({
    email: r.email,
    name: r.name ?? r.email,
    erpId: r.erp_id,
    erpRole: r.erp_role,
    erpStatus: r.erp_status,
    hasPassword: !!r.has_password,
    orderEntryRole: r.oe_role,
    orderEntryActive: !!r.oe_active,
    helpSlipRole: r.hs_role,
    helpSlipStatus: r.hs_status,
    helpSlipHrAccess: !!r.hs_hr,
    helpSlipDepartmentId: r.hs_dept,
  }));
}

/** The company department list, for the Help Slip column's picker. */
export async function loadDepartments(): Promise<Department[]> {
  const rows = await raw<Array<{ id: string; name: string }>>`
    select id::text, name from ld_help_slip.departments
    where status = 'active' order by name
  `;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

// ─── Order Entry ───────────────────────────────────────────────────────────

/**
 * Give somebody an Order Entry role, or take it away.
 *
 * NEVER deletes. `null` deactivates (`is_active = false`), which is the state
 * the standalone app already understands — deleting the row would orphan every
 * order that references them and break an app we do not control.
 */
export async function setOrderEntryRole(
  email: string,
  role: OrderEntryRole | null,
  name: string,
): Promise<void> {
  const e = email.toLowerCase();
  if (role === null) {
    await raw`update ld_order_entry.users set is_active = false where lower(email) = ${e}`;
    return;
  }
  const existing =
    await raw`select id from ld_order_entry.users where lower(email) = ${e}`;
  if (existing.length) {
    await raw`
      update ld_order_entry.users
         set role = ${role}::ld_order_entry.user_role, is_active = true
       where lower(email) = ${e}`;
  } else {
    await raw`
      insert into ld_order_entry.users (email, name, role, is_active)
      values (${e}, ${name}, ${role}::ld_order_entry.user_role, true)`;
  }
}

// ─── Help Slip ─────────────────────────────────────────────────────────────

/**
 * The sign-in record `ld_help_slip.profiles.id` points at.
 *
 * Reads `auth.users` directly to find an existing one — one column, filtered to
 * one email — and only calls Supabase's admin API when there is genuinely no
 * record to reuse. Creating a second auth user for an email that already has
 * one is rejected by Supabase anyway, and would be a mess if it were not.
 */
async function ensureAuthUser(email: string): Promise<string> {
  const e = email.toLowerCase();
  const found = await raw<Array<{ id: string }>>`
    select id::text from auth.users where lower(email) = ${e} limit 1`;
  if (found.length) return found[0].id;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Help Slip access needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.",
    );
  }
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    // `email_confirm` so nobody is sent a confirmation mail they never asked
    // for — the ERP is the thing that decides who exists, not an inbox.
    body: JSON.stringify({ email: e, email_confirm: true }),
    cache: "no-store",
  });
  const body = (await res.json()) as { id?: string; msg?: string };
  if (!res.ok || !body.id) {
    throw new Error(`Couldn't create the Help Slip sign-in record.`);
  }
  return body.id;
}

/**
 * Give somebody a Help Slip role, or take it away.
 *
 * `null` sets their profile to `inactive` rather than deleting it. A concern
 * carries its author, and deleting the profile would cascade — `profiles.id`
 * is `ON DELETE CASCADE` from `auth.users`, so removing the sign-in record
 * would take their concerns with it. That is never what "remove access" means.
 */
export async function setHelpSlipAccess(
  email: string,
  args: {
    role: HelpSlipRole | null;
    departmentId: string | null;
    hrAccess: boolean;
    name: string;
  },
): Promise<void> {
  const e = email.toLowerCase();
  const existing = await raw<Array<{ id: string }>>`
    select id::text from ld_help_slip.profiles where lower(login_id) = ${e} limit 1`;

  if (args.role === null) {
    if (existing.length) {
      await raw`update ld_help_slip.profiles set status = 'inactive', updated_at = now()
                 where lower(login_id) = ${e}`;
    }
    return;
  }

  const dept = args.departmentId;
  if (existing.length) {
    await raw`
      update ld_help_slip.profiles
         set role = ${args.role}::ld_help_slip.user_role,
             hr_access = ${args.hrAccess},
             department_id = ${dept}::uuid,
             status = 'active',
             updated_at = now()
       where lower(login_id) = ${e}`;
    return;
  }

  const authId = await ensureAuthUser(e);
  await raw`
    insert into ld_help_slip.profiles
      (id, full_name, login_id, email, role, hr_access, department_id, status)
    values (${authId}::uuid, ${args.name}, ${e}, ${e},
            ${args.role}::ld_help_slip.user_role, ${args.hrAccess},
            ${dept}::uuid, 'active')`;
}
