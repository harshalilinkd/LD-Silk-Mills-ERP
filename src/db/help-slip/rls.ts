import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql as rawSql } from "@/db";
import * as helpSlipSchema from "./schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE QUERYING ANYTHING IN ld_help_slip
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Help Slip puts its ENTIRE authorization model in Row Level Security. The
 * policy that matters most is on `concerns`:
 *
 *     withdrawn_at IS NULL
 *     AND ( employee_id = auth.uid()
 *           OR ( is_staff() AND (visibility = 'standard' OR can_see_hr()) ) )
 *
 * That single expression is what stops one employee reading another's
 * concern, and what stops a coordinator without `hr_access` reading a
 * confidential (`hr_only`) one — often a complaint *about* a colleague.
 *
 * Our connection pool authenticates as `postgres`, which has
 * `rolbypassrls = true`. On a bare connection every one of those policies is
 * skipped and a plain `select * from ld_help_slip.concerns` returns
 * everything, confidential rows included, with no error and no warning.
 *
 * So: `withHelpSlip()` below is the ONLY sanctioned way to touch this schema.
 * It opens a transaction, drops to the `authenticated` role and injects the
 * caller's profile id as the JWT `sub` claim, which is what `auth.uid()`
 * reads. From that point the database enforces exactly what it enforces for
 * the standalone app — we are not reimplementing the rules, we are standing
 * inside them.
 *
 * `SET LOCAL` is transaction-scoped, so the elevated role is reverted by
 * COMMIT/ROLLBACK and cannot leak to the next borrower of a pooled
 * connection. There is a test asserting exactly that.
 *
 * The one legitimate exception is resolving a signed-in email to a profile,
 * which necessarily happens before we know whose context to assume. That
 * lives in `unsafeLookupProfileByEmail` — named to be conspicuous, and the
 * only bypassing read in the module.
 */

export type HelpSlipDb = PostgresJsDatabase<typeof helpSlipSchema>;

/**
 * Run `fn` with the database believing it is serving `profileId`.
 *
 * ⚠️ CONCURRENCY. This opens a transaction, and a transaction PINS a
 * connection for its whole life. The shared pool is capped at 5
 * (src/db/index.ts) and through the Supavisor transaction pooler the surplus
 * does not queue — it stalls, for minutes. Fanning out 12 of these at once
 * wedged the pool during development and had to be killed.
 *
 * So: **one withHelpSlip per request, wrapping every query that request
 * needs** — never one per query, and never `Promise.all` over a list of them.
 * Sequential queries inside a single call are free; they share the one
 * transaction. Four concurrent calls is the tested ceiling.
 *
 *     // right
 *     withHelpSlip(id, async (db) => {
 *       const a = await db.select()...;
 *       const b = await db.select()...;
 *       return { a, b };
 *     });
 *
 *     // wrong — five pinned connections, then a stall
 *     await Promise.all(ids.map((id) => withHelpSlip(id, ...)));
 */
export async function withHelpSlip<T>(
  profileId: string,
  fn: (db: HelpSlipDb) => Promise<T>,
): Promise<T> {
  // Guard the interpolation below. These values reach the session through
  // set_config()'s parameter binding, but the id is also the thing standing
  // between one person's data and everyone else's — so it is validated as a
  // UUID before it is allowed anywhere near a session setting.
  if (!UUID_RE.test(profileId)) {
    throw new Error("withHelpSlip: profileId must be a UUID");
  }

  return rawSql.begin(async (tx) => {
    // `authenticated` is the role Help Slip's policies are granted TO, and
    // unlike `postgres` it does not bypass RLS.
    await tx.unsafe("SET LOCAL ROLE authenticated");
    // What Supabase's auth.uid() reads. Bound as a parameter, and `true`
    // makes it local to this transaction.
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: profileId,
      role: "authenticated",
    })}, true)`;

    const db = drizzle(tx as never, { schema: helpSlipSchema });
    return fn(db);
  }) as T;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a signed-in shell email to a Help Slip profile.
 *
 * ⚠️ This runs WITHOUT an RLS context, because there is no context to assume
 * until we know who the caller is. It is therefore restricted to exactly the
 * columns needed to establish identity, filtered to one email, and must never
 * grow into a general-purpose profile reader. Everything downstream of it
 * goes through `withHelpSlip`.
 */
export async function unsafeLookupProfileByEmail(email: string): Promise<{
  id: string;
  fullName: string;
  role: helpSlipSchema.UserRole;
  hrAccess: boolean;
  status: helpSlipSchema.AccountStatus;
  departmentId: string | null;
  locale: string;
  avatarUrl: string | null;
} | null> {
  const rows = await rawSql<
    {
      id: string;
      full_name: string;
      role: helpSlipSchema.UserRole;
      hr_access: boolean;
      status: helpSlipSchema.AccountStatus;
      department_id: string | null;
      locale: string;
      avatar_url: string | null;
    }[]
  >`
    select id, full_name, role, hr_access, status, department_id, locale, avatar_url
    from ld_help_slip.profiles
    where lower(login_id) = lower(${email})
    limit 1
  `;

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.full_name,
    role: r.role,
    hrAccess: r.hr_access,
    status: r.status,
    departmentId: r.department_id,
    locale: r.locale,
    avatarUrl: r.avatar_url,
  };
}
