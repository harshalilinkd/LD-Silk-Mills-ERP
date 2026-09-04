import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { goodsReturnDb } from "@/db/goods-return";
import { returns } from "@/db/goods-return/schema";
import { auditLogs, users } from "@/db/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Receiving — the third write, and the one an adversarial review caught
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's `app/(app)/receiving/actions.ts`. It was
 * missed entirely on the first pass: the logic layer got the insert and the
 * update but not this, and nothing in the shell wrote `status = 'received'` or
 * either Bhiwandi amount. A review agent grepping for those writes is what
 * found it, which is why that pass exists.
 *
 * ── THE GUARD IS THE WHOLE FUNCTION ──────────────────────────────────────
 *
 * `where(id = ? AND status = 'posted')` is not defensive tidiness. Receiving is
 * the one action two people plausibly do at the same moment — a return is
 * marked off a list on a phone in the warehouse while somebody at a desk does
 * the same row. Without the status in the WHERE, the second write silently
 * overwrites the first: a new `received_at`, and, worse, a second set of
 * Bhiwandi charges replacing the ones actually entered from the bill.
 *
 * Zero rows updated therefore means "somebody got there first", which is
 * reported as a sentence rather than thrown — the row is fine, the person just
 * needs to know why the button did nothing.
 */

/** Strips ₹, commas and spaces; empty becomes NULL, not 0. */
function money(v?: string | null): string | null {
  if (v == null) return null;
  const cleaned = String(v).replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  // NOT `|| null` — 0 is a real answer here. A transport charge of zero (own
  // vehicle, collected by the party) is different from "not recorded", and the
  // reports distinguish them.
  return Number.isFinite(n) ? String(n) : null;
}

export type ReceiveInput = {
  notes?: string;
  bhiwandiTransportValue?: string;
  bhiwandiCharges?: string;
};

export type ReceiveResult = { ok: true } | { ok: false; error: string };

/**
 * Mark a return received, and record what Bhiwandi actually paid.
 *
 * ── WHY `received_by` IS LEFT NULL ───────────────────────────────────────
 *
 * `returns.received_by` is an integer foreign key into `goods_return.users`,
 * which holds three rows: two shared passwordless office logins and one person.
 * Our people live in `ld_erp_core.users` with UUID ids, in a different schema.
 * There is no id to put in that column without inserting a row per employee
 * into a live table belonging to an app that is still running — and whose
 * `password_hash` is NOT NULL, so each row would need a fabricated hash.
 *
 * So the column stays NULL, exactly as it is on all 341 existing rows, and the
 * attribution goes somewhere we own: `ld_erp_core.audit_logs`, which exists for
 * this and already carries a user id, an action and a metadata blob. The detail
 * screen reads the name back from there. Nothing is written to `goods_return`
 * that the standalone app would not recognise.
 */
export async function markReceived(
  returnId: number,
  actorUserId: string,
  input: ReceiveInput = {},
): Promise<ReceiveResult> {
  if (!Number.isInteger(returnId) || returnId <= 0) {
    return { ok: false, error: "That return id is not valid." };
  }

  const updated = await goodsReturnDb
    .update(returns)
    .set({
      status: "received",
      receivedAt: new Date(),
      receivingNotes: input.notes?.trim() || null,
      bhiwandiTransportValue: money(input.bhiwandiTransportValue),
      bhiwandiCharges: money(input.bhiwandiCharges),
    })
    .where(and(eq(returns.id, returnId), eq(returns.status, "posted")))
    .returning({ id: returns.id, displayId: returns.displayId });

  if (updated.length === 0) {
    return {
      ok: false,
      error: "This return has already been marked received by somebody else.",
    };
  }

  // Attribution, in our own schema. Best-effort: the receipt above is the
  // thing that matters and is already committed, so a failure to log must not
  // report an error about a write that succeeded.
  try {
    await db.insert(auditLogs).values({
      userId: actorUserId,
      action: "goods-return.received",
      systemCode: "goods-return-lr",
      metadata: {
        returnId,
        displayId: updated[0].displayId,
        bhiwandiTransportValue: money(input.bhiwandiTransportValue),
        bhiwandiCharges: money(input.bhiwandiCharges),
      },
    });
  } catch {
    // deliberately swallowed — see above
  }

  return { ok: true };
}

/**
 * Who marked these returns received, from our audit trail.
 *
 * Keyed by `display_id` because that is what the metadata carries and what a
 * screen already has in hand. Returns a Map so a list can annotate many rows
 * from one query rather than one lookup per row.
 *
 * Only covers receipts made through the ERP. The 277 already received in the
 * standalone app have no entry and come back absent, which the screen renders
 * as "—" — the same honest blank the old system always showed, rather than a
 * name invented for them.
 */
export async function receivedByNames(
  displayIds: string[],
): Promise<Map<string, { name: string; at: Date }>> {
  const out = new Map<string, { name: string; at: Date }>();
  if (displayIds.length === 0) return out;

  // The id lives inside the jsonb blob, so it is read with ->> rather than as
  // a column. Bound as a json array and expanded server-side: never interpolate
  // a JS array into SQL (`${arr}::text[]` arrives as its toString and Postgres
  // rejects it) — the same trap CLAUDE.md records for Help Slip.
  const displayIdExpr = sql<string>`${auditLogs.metadata}->>'displayId'`;

  const rows = await db
    .select({
      name: users.name,
      at: auditLogs.createdAt,
      displayId: displayIdExpr,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .where(
      and(
        eq(auditLogs.action, "goods-return.received"),
        sql`${displayIdExpr} in (
          select value from jsonb_array_elements_text(${JSON.stringify(displayIds)}::jsonb)
        )`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt));

  // Newest first, and `set` only if absent — so a row received, un-received and
  // received again reports the LATEST person rather than the first.
  for (const r of rows) {
    if (r.displayId && !out.has(r.displayId)) {
      out.set(r.displayId, { name: r.name, at: r.at });
    }
  }
  return out;
}
