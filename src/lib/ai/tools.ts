import "server-only";

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { sql as raw } from "@/db";
import { getVisibleSystemsForUser } from "@/lib/queries";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What the assistant can look up — and nothing else
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── EVERY TOOL IS READ-ONLY, AND THAT IS THE DESIGN ──────────────────────
 *
 * Not one of these writes. The assistant answers questions and explains
 * screens; it never records a return, never marks goods received, never edits
 * a person. That is deliberate rather than a first-version shortcut:
 *
 *   · A model that can act can act on a misunderstanding. "Mark the KAMAL
 *     return received" against the wrong LD number is a real financial record
 *     changed by a guess, with no second pair of eyes.
 *   · Every write in this ERP already has a screen with its own confirmation,
 *     its own guard, and a person who chose to press it. Routing around that
 *     removes the check, not the effort.
 *
 * If write actions are ever added, they belong behind an explicit confirm step
 * that shows the exact record and waits for a human press.
 *
 * ── EVERY TOOL IS SCOPED TO THE PERSON ASKING ────────────────────────────
 *
 * Each takes the caller's ERP user id and checks `system_access` before
 * touching a module's data. The assistant must never become the one place in
 * the app where somebody sees a system they were not given — the sidebar hides
 * it, the module guards refuse it, and so does this.
 *
 * Help Slip is stricter still: its rules live in the database as Row Level
 * Security, so those reads go through `withHelpSlip` under the CALLER's own
 * profile. Confidential concerns then stay invisible exactly as they do on the
 * screen — the model is not trusted to filter them, the database does it.
 *
 * ── RESULTS ARE SMALL ON PURPOSE ─────────────────────────────────────────
 *
 * Every query has a hard limit. A tool that can return 5,562 parties turns one
 * question into a very expensive request and buries the answer. Twenty rows
 * and a count answers "which parties send the most back" better than all of
 * them.
 */

export type ToolContext = {
  userId: string;
  name: string;
  email: string;
};

/** Which module codes this person may see, resolved once per conversation. */
async function allowedSystems(userId: string): Promise<Set<string>> {
  const systems = await getVisibleSystemsForUser(userId);
  return new Set(
    systems.filter((s) => s.status === "active").map((s) => s.systemCode),
  );
}

const DENIED = (what: string) =>
  `You do not have access to ${what}. An administrator can grant it in Settings → Access.`;

export function buildTools(ctx: ToolContext) {
  // Resolved lazily and shared by every tool, so one conversation asks once.
  let allowed: Set<string> | null = null;
  const may = async (code: string) => {
    allowed ??= await allowedSystems(ctx.userId);
    return allowed.has(code);
  };

  const orders = betaZodTool({
    name: "search_orders",
    description:
      "Search sales orders by party name, agent, order number or status. Returns up to 20 orders with their party, date, total and status. Use for any question about orders, sales or what a customer has bought.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Party name, agent name or order number. Leave out for the most recent."),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    run: async (input) => {
      if (!(await may("order-entry"))) return DENIED("Orders");
      const q = (input.query ?? "").trim();
      // `customer_orders` has NO status column and no soft-delete flag — an
      // order's progress lives per LINE in `line_stage_progress`, and lines
      // carry `is_cancelled` / `is_deleted`. Checked against the live table
      // rather than assumed; an earlier draft of this query invented three
      // columns that do not exist and would have failed on first use.
      const rows = await raw<Array<Record<string, unknown>>>`
        select o.order_no, o.order_date::text as date, o.party_name,
               o.agent, o.transport, o.department,
               count(l.id) filter (where not l.is_deleted)::int as lines,
               coalesce(sum(l.line_total) filter
                 (where not l.is_deleted and not l.is_cancelled), 0)::float as value
          from ld_order_entry.customer_orders o
          left join ld_order_entry.order_line_items l on l.order_id = o.id
         where (${q} = '' or o.party_name ilike ${"%" + q + "%"}
                          or o.agent      ilike ${"%" + q + "%"}
                          or o.order_no::text ilike ${"%" + q + "%"})
         group by o.id, o.order_no, o.order_date, o.party_name, o.agent,
                  o.transport, o.department
         order by o.order_date desc nulls last
         limit ${input.limit ?? 20}`;
      return rows.length ? JSON.stringify(rows) : "No orders matched.";
    },
  });

  const returns = betaZodTool({
    name: "search_goods_returns",
    description:
      "Search goods returns going back to parties. Filter by party, LD number, status (pending or received) or reason. Returns up to 20 with amounts and status.",
    inputSchema: z.object({
      query: z.string().optional().describe("Party, broker, bill no or LD number"),
      status: z.enum(["pending", "received"]).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    run: async (input) => {
      if (!(await may("goods-return-lr"))) return DENIED("Goods Return");
      const q = (input.query ?? "").trim();
      // The screens say Pending; the stored word is "posted".
      const st = input.status === "pending" ? "posted" : (input.status ?? "");
      const rows = await raw<Array<Record<string, unknown>>>`
        select r.display_id, r.dated::text as date, p.name as party, b.name as broker,
               r.return_reason as reason, r.status::text,
               r.total_value::float as billing_value,
               r.transport_value::float as transport_expected,
               r.bhiwandi_charges::float as bhiwandi_charges
          from goods_return.returns r
          left join goods_return.parties p on p.id = r.party_id
          left join goods_return.brokers b on b.id = r.broker_id
         where (${q} = '' or p.name ilike ${"%" + q + "%"}
                          or b.name ilike ${"%" + q + "%"}
                          or r.display_id ilike ${"%" + q + "%"}
                          or r.bill_no   ilike ${"%" + q + "%"})
           and (${st} = '' or r.status::text = ${st})
         order by r.id desc
         limit ${input.limit ?? 20}`;
      return rows.length ? JSON.stringify(rows) : "No returns matched.";
    },
  });

  const returnsSummary = betaZodTool({
    name: "goods_returns_summary",
    description:
      "Totals for goods returns: how many, how many pending vs received, total billing value, and the parties sending the most back. Use for 'how many', 'how much' and 'who' questions rather than listing rows.",
    inputSchema: z.object({
      from: z.string().optional().describe("Start date, YYYY-MM-DD"),
      to: z.string().optional().describe("End date, YYYY-MM-DD"),
    }),
    run: async (input) => {
      if (!(await may("goods-return-lr"))) return DENIED("Goods Return");
      const from = input.from ?? null;
      const to = input.to ?? null;
      const [totals] = await raw<Array<Record<string, unknown>>>`
        select count(*)::int as returns,
               count(*) filter (where status = 'posted')::int   as pending,
               count(*) filter (where status = 'received')::int as received,
               coalesce(sum(total_value), 0)::float             as billing_value,
               count(*) filter (where total_value is null)::int as no_amount_recorded
          from goods_return.returns
         where (${from}::date is null or dated >= ${from}::date)
           and (${to}::date   is null or dated <= ${to}::date)`;
      const top = await raw<Array<Record<string, unknown>>>`
        select p.name as party, count(*)::int as returns,
               coalesce(sum(r.total_value), 0)::float as value
          from goods_return.returns r join goods_return.parties p on p.id = r.party_id
         where (${from}::date is null or r.dated >= ${from}::date)
           and (${to}::date   is null or r.dated <= ${to}::date)
         group by p.name order by count(*) desc limit 8`;
      return JSON.stringify({ totals, topPartiesByCount: top });
    },
  });

  const customer = betaZodTool({
    name: "find_customer",
    description:
      "Find a party across every list in the business, including different spellings of the same name. Shows which lists they appear in and how many orders and returns they have. Use whenever somebody names a customer.",
    inputSchema: z.object({
      name: z.string().describe("All or part of the party name"),
    }),
    run: async (input) => {
      const q = input.name.trim();
      if (!q) return "Give me part of a name to look for.";
      // Matched on the name stripped to letters and digits, so "R.G.FASHION"
      // and "RG FASHION" find each other — the whole reason this tool exists.
      const key = `%${q.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}%`;
      const out: Record<string, unknown> = {};

      if (await may("order-entry")) {
        out.inErpMasterList = await raw`
          select value as name from ld_order_entry.lookup_values
           where category = 'PARTY'
             and upper(regexp_replace(value, '[^A-Za-z0-9]', '', 'g')) like ${key}
           order by value limit 12`;
        out.orders = await raw`
          select count(distinct o.id)::int as orders,
                 coalesce(sum(l.line_total) filter
                   (where not l.is_deleted and not l.is_cancelled), 0)::float as value
            from ld_order_entry.customer_orders o
            left join ld_order_entry.order_line_items l on l.order_id = o.id
           where upper(regexp_replace(o.party_name, '[^A-Za-z0-9]', '', 'g')) like ${key}`;
      }
      if (await may("goods-return-lr")) {
        out.inGoodsReturnList = await raw`
          select name from goods_return.parties
           where upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')) like ${key}
           order by name limit 12`;
        out.goodsReturns = await raw`
          select count(*)::int as returns,
                 coalesce(sum(r.total_value), 0)::float as value
            from goods_return.returns r join goods_return.parties p on p.id = r.party_id
           where upper(regexp_replace(p.name, '[^A-Za-z0-9]', '', 'g')) like ${key}`;
      }
      return Object.keys(out).length
        ? JSON.stringify(out)
        : DENIED("any system holding customer records");
    },
  });

  const workload = betaZodTool({
    name: "whats_waiting",
    description:
      "What needs attention right now across every system this person can see: goods awaiting receipt, follow-ups due, unresolved concerns. Use for 'what should I look at', 'anything pending', or a morning summary.",
    inputSchema: z.object({}),
    run: async () => {
      const out: Record<string, unknown> = {};

      if (await may("goods-return-lr")) {
        const [gr] = await raw<Array<Record<string, unknown>>>`
          select count(*) filter (where status = 'posted')::int as awaiting_receipt,
                 count(*) filter (where status = 'posted'
                   and coalesce(posted_on, dated) < current_date - 30)::int as waiting_over_30_days,
                 coalesce(sum(total_value) filter (where status = 'posted'), 0)::float as value_in_transit
            from goods_return.returns`;
        out.goodsReturn = gr;
      }
      if (await may("crm")) {
        // `due_at`, not `due_date` — and the status vocabulary is upper-case.
        const [crm] = await raw<Array<Record<string, unknown>>>`
          select count(*)::int as open_followups,
                 count(*) filter (where due_at < now())::int as overdue,
                 count(*) filter (where attempt_count >= 3)::int as many_attempts,
                 count(*) filter (where is_escalated)::int as escalated
            from ld_order_entry.crm_followups
           where status not in ('COMPLETED', 'UNREACHABLE')`;
        out.crm = crm;
        const [iss] = await raw<Array<Record<string, unknown>>>`
          select count(*)::int as open_issues
            from ld_order_entry.crm_issues where status <> 'RESOLVED'`;
        out.crmIssues = iss;
      }
      if (await may("order-entry")) {
        // "Open" cannot be read off the order — progress is per line, in
        // line_stage_progress. An order counts as still moving while any of
        // its live lines has a stage not yet done.
        const [oe] = await raw<Array<Record<string, unknown>>>`
          select count(distinct o.id)::int as orders_still_in_progress
            from ld_order_entry.customer_orders o
            join ld_order_entry.order_line_items l on l.order_id = o.id
           where not l.is_deleted and not l.is_cancelled
             and exists (
               select 1 from ld_order_entry.workflow_stages w
                left join ld_order_entry.line_stage_progress pr
                       on pr.order_line_item_id = l.id and pr.stage_key = w.stage_key
                where coalesce(pr.is_done, false) = false)`;
        out.orders = oe;
      }
      return Object.keys(out).length
        ? JSON.stringify(out)
        : "You have not been given any systems yet.";
    },
  });

  return [orders, returns, returnsSummary, customer, workload];
}
