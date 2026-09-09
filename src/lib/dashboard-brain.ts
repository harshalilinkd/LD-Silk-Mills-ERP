import "server-only";

import { sql } from "@/db";
import { withHelpSlip, unsafeLookupProfileByEmail } from "@/db/help-slip/rls";
import { inrShort, plural } from "@/lib/reports/format";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The home page's operational snapshot
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The dashboard used to describe the SHELL — how many systems were configured,
 * how many user rows existed, and two tiles promising audit events "in Phase
 * 2", a phase that finished long ago. None of it was a thing anybody could act
 * on, and the one panel with real estate spent it saying "no activity yet".
 *
 * This is the other question: what is waiting for somebody, right now, in the
 * modules THIS person is allowed to open.
 *
 * ── EVERY FIGURE IS GATED BY `system_access` ─────────────────────────────
 *
 * The sidebar hides a system you have not been granted, the module layouts
 * refuse it, and the AI assistant checks it per tool. A home page that printed
 * "₹9.3 cr on the order book" to somebody with no Orders access would be the
 * one place in this ERP where that leaks, and it would leak the most
 * commercially sensitive number we hold. So the caller passes the codes it
 * already resolved for the sidebar, and a probe whose code is missing never
 * runs — which also means somebody with two modules pays for two queries.
 *
 * ── CHEAP, AND AWAITED IN TURN ───────────────────────────────────────────
 *
 * Every probe is a single aggregate against an index — measured at 4–15ms
 * each. They run IN TURN rather than through `Promise.all`, because the pool
 * is five wide and pipelined statements stall under the transaction pooler:
 * the same rule the reports dashboards follow. This page must never run a
 * REPORT — production status alone is 6,000 rows, and the home page is the one
 * screen everybody loads first.
 *
 * ── IT DOES NOT INVENT DEFINITIONS ───────────────────────────────────────
 *
 * "Live line" here means what it means in `order-entry/shared.ts`: not
 * deleted and not cancelled. If that definition ever moves, this file has to
 * move with it — a home page that says 274 open orders over a Reports page
 * saying 270 is the "two screens disagree by lakhs" failure this ERP keeps
 * writing rules to avoid. The figures are deliberately COUNTS and a balance,
 * never a derived rate, so there is little room for them to drift.
 */

export type Tone = "neutral" | "good" | "warn" | "bad";

export type Tile = {
  /** `system_code`, so the caller can prove the viewer may see it. */
  code: string;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  href: string;
};

/** One thing waiting for somebody, with the screen that deals with it. */
export type Attention = {
  code: string;
  title: string;
  detail: string;
  href: string;
  tone: Tone;
};

export type Snapshot = {
  tiles: Tile[];
  attention: Attention[];
  /** Real audit rows. The old panel promised these and never showed any. */
  activity: { at: string; who: string; what: string; system: string }[];
};

const one = async <T>(text: string): Promise<T | null> => {
  try {
    const rows = (await sql.unsafe(text)) as unknown as T[];
    return rows[0] ?? null;
  } catch (e) {
    // A probe that fails is a missing tile, never a broken home page. Every
    // module in here reads a DIFFERENT schema and two of them are shared with
    // apps this repo does not control.
    console.error("dashboard probe failed:", (e as Error).message);
    return null;
  }
};

const num = (v: unknown) => Number(v ?? 0);

/**
 * Verb agreement, because these sentences are BUILT and one of them shipped
 * reading "1 petty cash entries have no proof recorded". A count in a sentence
 * has to agree with it — the module already has `plural()` for the noun; this
 * is the other half.
 */
const be = (n: number) => (n === 1 ? "is" : "are");
const have = (n: number) => (n === 1 ? "has" : "have");

export async function getOperationalSnapshot(
  /** `system_code`s the viewer may open — resolved once, for the sidebar. */
  codes: Set<string>,
  viewerEmail: string | null,
): Promise<Snapshot> {
  const tiles: Tile[] = [];
  const attention: Attention[] = [];

  // ── ORDERS ─────────────────────────────────────────────────────────────
  if (codes.has("order-entry")) {
    const book = await one<{ live_orders: string; open_orders: string; to_deliver: string }>(`
      with per as (
        select o.id,
               count(l.id) filter (where not l.is_cancelled and not coalesce(l.is_deleted,false)) as live,
               coalesce(sum(l.line_total) filter (where not l.is_cancelled and not coalesce(l.is_deleted,false)), 0) as val,
               count(l.id) filter (where not l.is_cancelled and not coalesce(l.is_deleted,false)
                                     and exists (select 1 from ld_order_entry.line_stage_progress p
                                                 join ld_order_entry.workflow_stages w on w.stage_key = p.stage_key
                                                 where p.order_line_item_id = l.id and p.is_done
                                                   and w.sort_order = (select max(sort_order) from ld_order_entry.workflow_stages))) as done
        from ld_order_entry.customer_orders o
        left join ld_order_entry.order_line_items l on l.order_id = o.id
        group by o.id
      )
      select count(*) filter (where live > 0)                       as live_orders,
             count(*) filter (where live > 0 and done < live)       as open_orders,
             coalesce(sum(val) filter (where live > 0 and done < live), 0)::text as to_deliver
      from per`);
    if (book) {
      tiles.push({
        code: "order-entry",
        label: "Still to deliver",
        value: inrShort(num(book.to_deliver)),
        sub: `${num(book.open_orders).toLocaleString("en-IN")} of ${num(book.live_orders).toLocaleString("en-IN")} orders open`,
        tone: "neutral",
        href: "/order-entry/orders",
      });
    }

    const notStarted = await one<{ n: string }>(`
      select count(*) as n
      from ld_order_entry.order_line_items li
      where not li.is_deleted and not li.is_cancelled
        and not exists (select 1 from ld_order_entry.line_stage_progress p
                        where p.order_line_item_id = li.id and p.is_done)`);
    if (notStarted && num(notStarted.n) > 0) {
      attention.push({
        code: "order-entry",
        title: `${plural(num(notStarted.n), "order line")} ${have(num(notStarted.n))} not started`,
        detail: "No stage ticked at all — nothing has moved on these yet.",
        href: "/order-entry/tracking",
        tone: "warn",
      });
    }
  }

  // ── CRM ────────────────────────────────────────────────────────────────
  if (codes.has("crm")) {
    const calls = await one<{ due: string; overdue: string }>(`
      select count(*) filter (where contacted_at is null)                                   as due,
             count(*) filter (where contacted_at is null
                                and due_at < (now() at time zone 'Asia/Kolkata'))           as overdue
      from ld_order_entry.crm_followups
      where status = 'DUE'`);
    if (calls) {
      tiles.push({
        code: "crm",
        label: "Calls to make",
        value: num(calls.due).toLocaleString("en-IN"),
        sub: num(calls.overdue) > 0 ? `${num(calls.overdue).toLocaleString("en-IN")} past the date` : "none overdue",
        tone: num(calls.overdue) > 0 ? "bad" : num(calls.due) > 0 ? "warn" : "good",
        href: "/crm",
      });
      if (num(calls.overdue) > 0) {
        attention.push({
          code: "crm",
          title: `${plural(num(calls.overdue), "follow-up")} ${be(num(calls.overdue))} past the call date`,
          detail: "The customer has taken delivery and nobody has rung them yet.",
          href: "/crm",
          tone: "bad",
        });
      }
    }
  }

  // ── GOODS RETURN ───────────────────────────────────────────────────────
  if (codes.has("goods-return-lr")) {
    const gr = await one<{ waiting: string; old: string }>(`
      select count(*)                                                                        as waiting,
             count(*) filter (where dated < (now() at time zone 'Asia/Kolkata')::date - 30)  as old
      from goods_return.returns
      where status = 'posted'`);
    if (gr) {
      tiles.push({
        code: "goods-return-lr",
        label: "Awaiting receipt",
        value: num(gr.waiting).toLocaleString("en-IN"),
        sub: num(gr.old) > 0 ? `${num(gr.old).toLocaleString("en-IN")} over a month out` : "returns still in transit",
        tone: num(gr.old) > 0 ? "bad" : num(gr.waiting) > 0 ? "warn" : "good",
        href: "/goods-return/receiving",
      });
      if (num(gr.old) > 0) {
        attention.push({
          code: "goods-return-lr",
          title: `${plural(num(gr.old), "return")} ${have(num(gr.old))} been out more than a month`,
          detail: "Sent to the party and never marked received at Bhiwandi.",
          href: "/goods-return/receiving",
          tone: "bad",
        });
      }
    }
  }

  // ── CHECKLIST ──────────────────────────────────────────────────────────
  if (codes.has("checklist")) {
    const duties = await one<{ today: string; delayed: string }>(`
      select count(*) filter (where planned_date = (now() at time zone 'Asia/Kolkata')::date and status <> 'Done') as today,
             count(*) filter (where planned_date <  (now() at time zone 'Asia/Kolkata')::date and status <> 'Done') as delayed
      from ld_checklist_system.occurrences`);
    if (duties) {
      tiles.push({
        code: "checklist",
        label: "Duties due today",
        value: num(duties.today).toLocaleString("en-IN"),
        sub: num(duties.delayed) > 0 ? `${num(duties.delayed).toLocaleString("en-IN")} already late` : "nothing overdue",
        tone: num(duties.delayed) > 0 ? "bad" : num(duties.today) > 0 ? "warn" : "good",
        href: "/checklist",
      });
      if (num(duties.delayed) > 0) {
        attention.push({
          code: "checklist",
          title: `${plural(num(duties.delayed), "duty", "duties")} ${be(num(duties.delayed))} overdue`,
          detail: "Scheduled, come round, and still not ticked.",
          href: "/checklist",
          tone: "bad",
        });
      }
    }
  }

  // ── PETTY CASH ─────────────────────────────────────────────────────────
  if (codes.has("petty-cash")) {
    const box = await one<{ bal: string; entries: string; no_proof: string }>(`
      select coalesce(sum(case when transaction_type = 'CREDIT' then amount else -amount end), 0)::text as bal,
             count(*)::text                                                                            as entries,
             count(*) filter (where proof_type is null or proof_type::text = 'NONE')::text              as no_proof
      from ld_petty_cash.transactions
      where deleted_at is null`);
    if (box) {
      tiles.push({
        code: "petty-cash",
        label: "Cash in the box",
        value: inrShort(num(box.bal)),
        sub: `${plural(num(box.entries), "entry", "entries")} on record`,
        tone: num(box.bal) < 0 ? "bad" : "neutral",
        href: "/petty-cash",
      });
      if (num(box.no_proof) > 0) {
        attention.push({
          code: "petty-cash",
          title: `${plural(num(box.no_proof), "petty cash entry", "petty cash entries")} ${have(num(box.no_proof))} no proof recorded`,
          detail: "No voucher, bill or receipt kind against the payment.",
          href: "/petty-cash",
          tone: "warn",
        });
      }
    }
  }

  // ── HELP SLIP ──────────────────────────────────────────────────────────
  //
  // The one module whose figure DIFFERS PER PERSON, and it must: RLS decides
  // which concerns this viewer may count, exactly as it decides what they may
  // read. It goes through `withHelpSlip` under their own profile — a bare
  // count would run as `postgres`, which bypasses RLS and would put a
  // confidential HR concern into somebody's tile total.
  if (codes.has("help-slip") && viewerEmail) {
    try {
      const profile = await unsafeLookupProfileByEmail(viewerEmail);
      if (profile) {
        const open = await withHelpSlip(profile.id, async (db) => {
          const r: unknown = await db.execute(
            `select count(*)::int as n
               from ld_help_slip.concerns
              where status not in ('resolved', 'closed')`,
          );
          // postgres-js hands drizzle a plain array; other drivers wrap it in
          // `.rows`. Read whichever actually arrived rather than assuming one.
          const rows = Array.isArray(r)
            ? (r as { n: number }[])
            : ((r as { rows?: { n: number }[] }).rows ?? []);
          return num(rows[0]?.n ?? 0);
        });
        tiles.push({
          code: "help-slip",
          label: "Concerns open",
          value: open.toLocaleString("en-IN"),
          sub: "that you are allowed to see",
          tone: open > 0 ? "warn" : "good",
          href: "/help-slip",
        });
      }
    } catch (e) {
      console.error("help slip probe failed:", (e as Error).message);
    }
  }

  // ── WHAT ACTUALLY HAPPENED ─────────────────────────────────────────────
  //
  // Real rows. The panel this replaces said "Login and access events will show
  // up here once Phase 2 wires up authentication" — a promise about a phase
  // that shipped, printed over a table that has had rows in it for weeks.
  //
  // `audit_logs` records WHO as a user id, not an email — the name has to be
  // joined for. A left join, because a row written by a background path has
  // no user and must still appear rather than vanishing from the feed.
  let activity: Snapshot["activity"] = [];
  try {
    activity = (await sql.unsafe(`
      select to_char(a.created_at at time zone 'Asia/Kolkata', 'DD Mon, HH24:MI') as at,
             coalesce(u.name, u.email, 'System')                                   as who,
             a.action                                                              as what,
             coalesce(a.system_code, '')                                           as system
      from ld_erp_core.audit_logs a
      left join ld_erp_core.users u on u.id = a.user_id
      order by a.created_at desc
      limit 6`)) as unknown as Snapshot["activity"];
  } catch (e) {
    console.error("audit feed failed:", (e as Error).message);
  }

  return { tiles, attention, activity };
}
