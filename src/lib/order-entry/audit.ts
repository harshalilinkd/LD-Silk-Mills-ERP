// Writing down who removed an order, and what was in it.
//
// ═══════════════════════════════════════════════════════════════════════════
//  WHY THIS EXISTS — THREE ORDERS, AND NOBODY COULD SAY WHAT HAPPENED
// ═══════════════════════════════════════════════════════════════════════════
//
// Sep 2026. Orders 1262, 1264 and 1265 (Watchlier Clothing, 8 Sep, LONDON,
// ~₹29 lakh between them) were in a screenshot in the afternoon and gone from
// the table by evening. Every table was searched — `design_database`, which
// survives its order because `order_id` is ON DELETE SET NULL, `crm_followups`,
// the audit log itself — and there was no trace of any kind. The permanent
// delete endpoint simply ran `db.delete(customerOrders)` and returned.
//
// So nobody could say who removed them, when, or what was in them, and there
// was nothing to restore from. That is what this fixes.
//
// ── THE ROW IS WRITTEN BEFORE THE DELETE, AND THAT ORDER IS DELIBERATE ────
//
// Audit-after leaves exactly the hole above whenever the second write fails.
// Audit-before can leave a row describing a delete that did not happen — which
// is recoverable, because the order is still sitting there to be looked at. Of
// the two ways to be wrong, only one loses the answer.
//
// ── AND IT CARRIES THE WHOLE ORDER, NOT JUST ITS NUMBER ──────────────────
//
// `metadata` is jsonb, so the snapshot holds the party, the date, the totals
// AND every design line with its quantity and rate. A permanent delete is the
// one action in this module with no undo; storing the number alone would have
// told us WHO in this case, and still left nothing to put back.

import { and, eq } from "drizzle-orm";

import { db as coreDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { orderEntryDb } from "@/db/order-entry";
import { customerOrders, orderLineItems } from "@/db/order-entry/schema";

/** As many design lines as one snapshot will hold. */
const MAX_SNAPSHOT_LINES = 500;

export type OrderSnapshot = {
  order_no: string;
  order_date: string;
  party_name: string;
  department: string | null;
  sales_person: string | null;
  agent: string | null;
  transport: string | null;
  challan_no: string | null;
  lot_no: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string | null;
  line_count: number;
  live_line_count: number;
  total_qty: number;
  total_value: number;
  lines: {
    quality: string;
    design_no: string;
    qty_mtr: string;
    rate: string | null;
    line_total: string | null;
    is_cancelled: boolean;
    is_deleted: boolean;
    remarks: string | null;
  }[];
  lines_truncated?: number;
};

/**
 * Everything about one order, as a plain object that can go into `metadata`.
 *
 * Reads the DELETED lines too: on the permanent-delete path every line is
 * soft-deleted by definition (the endpoint refuses while a live one remains),
 * so skipping them would snapshot an order with nothing in it.
 */
export async function snapshotOrder(orderId: string): Promise<OrderSnapshot | null> {
  const [o] = await orderEntryDb
    .select()
    .from(customerOrders)
    .where(eq(customerOrders.id, orderId))
    .limit(1);
  if (!o) return null;

  const lines = await orderEntryDb
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, orderId))
    .orderBy(orderLineItems.quality, orderLineItems.designNo);

  const kept = lines.slice(0, MAX_SNAPSHOT_LINES);
  const num = (v: unknown) => Number(v ?? 0) || 0;

  return {
    order_no: o.orderNo,
    order_date: String(o.orderDate),
    party_name: o.partyName,
    department: o.department ?? null,
    sales_person: o.salesPerson ?? null,
    agent: o.agent ?? null,
    transport: o.transport ?? null,
    challan_no: o.challanNo ?? null,
    lot_no: o.lotNo ?? null,
    remarks: o.remarks ?? null,
    created_by: o.createdBy ?? null,
    created_at: o.createdAt ? o.createdAt.toISOString() : null,
    line_count: lines.length,
    live_line_count: lines.filter((l) => !l.isDeleted && !l.isCancelled).length,
    total_qty: lines.reduce((n, l) => n + num(l.qtyMtr), 0),
    total_value: lines.reduce((n, l) => n + num(l.lineTotal), 0),
    lines: kept.map((l) => ({
      quality: l.quality,
      design_no: l.designNo,
      qty_mtr: String(l.qtyMtr),
      rate: l.rate == null ? null : String(l.rate),
      line_total: l.lineTotal == null ? null : String(l.lineTotal),
      is_cancelled: l.isCancelled,
      is_deleted: l.isDeleted,
      remarks: l.remarks ?? null,
    })),
    ...(lines.length > kept.length ? { lines_truncated: lines.length - kept.length } : {}),
  };
}

/**
 * One audit row in `ld_erp_core.audit_logs`.
 *
 * `user_id` is a foreign key into the SHELL's users while Order Entry
 * authorises against `ld_order_entry.users` — two tables that happen to share
 * an email — so it is resolved by email and left NULL when there is no shell
 * account. The email is in the metadata either way, so the row still says who.
 *
 * THROWS on failure, on purpose. Every caller writes this BEFORE the thing it
 * is recording, so a throw means the destructive step does not happen — which
 * is the whole point.
 */
export async function auditOrderEntry(params: {
  action: string;
  email: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  let userId: string | null = null;
  if (params.email) {
    const [u] = await coreDb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, params.email.toLowerCase()))
      .limit(1);
    userId = u?.id ?? null;
  }
  await coreDb.insert(auditLogs).values({
    userId,
    action: params.action,
    systemCode: "order-entry",
    metadata: { ...params.metadata, by: params.email },
  });
}

/** How many of an order's lines are live — used to describe a bin/restore. */
export async function countLiveLines(orderId: string): Promise<number> {
  const rows = await orderEntryDb
    .select({ id: orderLineItems.id })
    .from(orderLineItems)
    .where(and(eq(orderLineItems.orderId, orderId), eq(orderLineItems.isDeleted, false)));
  return rows.length;
}
