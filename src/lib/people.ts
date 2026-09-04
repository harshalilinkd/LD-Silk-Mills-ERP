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

// ─── removing somebody, for real ───────────────────────────────────────────

export type Footprint = {
  /**
   * Empty means nothing anywhere references them, so a delete is safe.
   *
   * `one` and `many` rather than a single noun: the screen prints these into a
   * sentence, and with one form it read "There is 1 recorded actions".
   */
  blockers: { one: string; many: string; count: number }[];
  exists: { erp: boolean; orderEntry: boolean; helpSlip: boolean };
};

/**
 * Everything in the three schemas that would be orphaned by deleting somebody.
 *
 * This is what makes a real delete possible at all. The rule used to be a flat
 * "nothing is ever deleted", which is right for a person who has DONE things —
 * a concern carries its author, an order carries who raised it — and wrong for
 * the rows every system accumulates: a duplicate account on an old email, a
 * profile called "test admin". There was no way to remove those, so they stayed
 * in the People list looking like staff.
 *
 * So the question is asked per person rather than answered once in the
 * abstract: count the references, and offer a delete only when there are none.
 *
 * `customer_orders.created_by` is deliberately in here and is NOT a foreign
 * key — it stores the EMAIL as text. Postgres would happily delete the user and
 * leave every order they raised pointing at an address that no longer resolves
 * to anybody, with no error at any layer.
 */
export async function personFootprint(email: string): Promise<Footprint> {
  const e = email.toLowerCase();

  const [erpRow] = await raw<Array<{ id: string }>>`
    select id::text from ld_erp_core.users where lower(email) = ${e} limit 1`;
  const [oeRow] = await raw<Array<{ id: string }>>`
    select id::text from ld_order_entry.users where lower(email) = ${e} limit 1`;
  const [hsRow] = await raw<Array<{ id: string }>>`
    select id::text from ld_help_slip.profiles where lower(login_id) = ${e} limit 1`;

  const blockers: { one: string; many: string; count: number }[] = [];
  const add = async (
    one: string,
    many: string,
    rows: Promise<Array<{ n: number }>>,
  ) => {
    const n = (await rows)[0]?.n ?? 0;
    if (n > 0) blockers.push({ one, many, count: n });
  };

  // Order Entry — by email for orders, by id for the CRM queue.
  await add(
    "order they raised",
      "orders they raised",
    raw`select count(*)::int as n from ld_order_entry.customer_orders where lower(created_by) = ${e}`,
  );
  if (oeRow) {
    await add(
      "follow-up assigned to them",
      "follow-ups assigned to them",
      raw`select count(*)::int as n from ld_order_entry.crm_followups where assigned_to = ${oeRow.id}::uuid`,
    );
  }

  // Help Slip — a concern carries its author, so any of these is a hard stop.
  if (hsRow) {
    const id = hsRow.id;
    await add(
      "concern",
      "concerns",
      raw`select count(*)::int as n from ld_help_slip.concerns
           where employee_id = ${id}::uuid or assigned_to = ${id}::uuid or resolved_by = ${id}::uuid`,
    );
    await add(
      "reply on a concern",
      "replies on concerns",
      raw`select count(*)::int as n from ld_help_slip.concern_updates where actor_id = ${id}::uuid`,
    );
    await add(
      "solution they proposed",
      "solutions they proposed",
      raw`select count(*)::int as n from ld_help_slip.concern_solutions where proposed_by = ${id}::uuid`,
    );
    await add(
      "photo they uploaded",
      "photos they uploaded",
      raw`select count(*)::int as n from ld_help_slip.concern_attachments where uploaded_by = ${id}::uuid`,
    );
    await add(
      "access request they decided",
      "access requests they decided",
      raw`select count(*)::int as n from ld_help_slip.access_requests where reviewed_by = ${id}::uuid`,
    );
  }

  // The shell's own trail.
  if (erpRow) {
    await add(
      "recorded action in the audit log",
      "recorded actions in the audit log",
      raw`select count(*)::int as n from ld_erp_core.audit_logs where user_id = ${erpRow.id}::uuid`,
    );
  }

  return {
    blockers,
    exists: { erp: !!erpRow, orderEntry: !!oeRow, helpSlip: !!hsRow },
  };
}

/**
 * Delete somebody from all three systems, permanently.
 *
 * REFUSES unless `personFootprint` comes back empty, and it re-checks here
 * rather than trusting the screen — a server action is a POST endpoint, and the
 * caller could send any email.
 *
 * Order matters and follows the foreign keys inward: the rows that only exist
 * to describe access go first (`system_access`, `notifications`), then each
 * system's record, and the Supabase Auth user LAST because
 * `profiles.id → auth.users(id) ON DELETE CASCADE` means removing it takes the
 * profile with it — fine once the profile is already gone, destructive if the
 * order were reversed and the profile still had rows hanging off it.
 */
export async function deletePerson(email: string): Promise<void> {
  const e = email.toLowerCase();

  const fp = await personFootprint(e);
  if (fp.blockers.length > 0) {
    const list = fp.blockers
      .map((b) => `${b.count} ${b.count === 1 ? b.one : b.many}`)
      .join(", ");
    throw new Error(
      `This person has ${list}. Remove their access instead — deleting them would leave that work with no name on it.`,
    );
  }

  const [hsRow] = await raw<Array<{ id: string }>>`
    select id::text from ld_help_slip.profiles where lower(login_id) = ${e} limit 1`;
  if (hsRow) {
    await raw`delete from ld_help_slip.notifications where user_id = ${hsRow.id}::uuid`;
    await raw`delete from ld_help_slip.profiles where id = ${hsRow.id}::uuid`;
  }

  await raw`delete from ld_order_entry.users where lower(email) = ${e}`;

  const [erpRow] = await raw<Array<{ id: string }>>`
    select id::text from ld_erp_core.users where lower(email) = ${e} limit 1`;
  if (erpRow) {
    await raw`delete from ld_erp_core.system_access where user_id = ${erpRow.id}::uuid`;
    await raw`delete from ld_erp_core.users where id = ${erpRow.id}::uuid`;
  }

  // The sign-in record last. Best-effort: the person is already gone from every
  // screen at this point, and a stale auth row locks nothing — whereas throwing
  // here would report a failure about a delete that has already happened.
  if (hsRow) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      await fetch(`${url}/auth/v1/admin/users/${hsRow.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      }).catch(() => {});
    }
  }
}
