import { eq, inArray, sql } from "drizzle-orm";

import { goodsReturnDb } from "@/db/goods-return";
import { qualities, returnItems, returns } from "@/db/goods-return/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The two writes of the Goods Return module. Ported from the standalone
 *  app's `lib/returns.ts`, unchanged in behaviour.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Both functions are transactional because a return and its quality lines are
 * one record split across two tables: a return with no lines is not a partial
 * save, it is a corrupt row that every screen renders as an empty return and
 * every report counts as zero metres.
 *
 * `goods_return` is LIVE and still shared with the standalone app, which runs
 * against these same tables. Nothing here may become a migration, and no rule
 * may move into the database — see the header of
 * `src/db/goods-return/schema.ts`.
 */

/**
 * The shape the entry form hands over, expressed structurally so this file
 * carries no dependency on the form layer or on zod. A `z.infer` of the ported
 * `returnInputSchema` is assignable to it (its `entryFor`/`returnReason`
 * literal unions narrow `string`), so a validated object passes straight in
 * without a cast.
 */
export type ReturnItemInput = {
  qualityId: number;
  quantity: number;
  pieces?: number;
};

export type ReturnInput = {
  billNo?: string;
  entryFor: string;
  trackingNo?: string;
  dated: string;
  postedOn?: string;
  partyId: number;
  brokerId: number;
  transportId?: number;
  totalValue?: number;
  transportValue?: number;
  otherCharges?: number;
  returnReason: string;
  customReason?: string;
  items: ReturnItemInput[];
};

/**
 * Resolves the quality names for the lines about to be written.
 *
 * `return_items.quality_name` is a SNAPSHOT stored beside the foreign key, so
 * a line stays readable if the master row is later renamed — it is not
 * redundant, and it must be filled on every write or the coalesce every read
 * does falls back to nothing.
 *
 * Deliberately ONE query (`in (…)` over the distinct ids), and deliberately
 * run BEFORE the transaction opens rather than inside it: the pool is capped
 * at 5 and a transaction pins a connection for its whole life, so this keeps
 * the pinned window down to the writes themselves.
 */
async function qualityNameMap(items: ReturnInput["items"]) {
  const qids = [...new Set(items.map((i) => i.qualityId))];
  const qrows = qids.length
    ? await goodsReturnDb
        .select({ id: qualities.id, name: qualities.name })
        .from(qualities)
        .where(inArray(qualities.id, qids))
    : [];
  return new Map(qrows.map((q) => [q.id, q.name]));
}

/**
 * Inserts a return and its item lines atomically, assigning the next `LD-####`
 * id from the Postgres sequence. Returns the new display id.
 *
 * ── THE nextval CALL IS NOT AN IMPLEMENTATION DETAIL ─────────────────────
 *
 * `select nextval('goods_return.return_display_seq')` is the ONLY sanctioned
 * source of an `LD-####` id, and all three properties of the call below are
 * load-bearing:
 *
 *  · It must stay the SEQUENCE. `max(id) + 1` (or `max(display_id) + 1`) reads
 *    committed rows only, so two clerks entering at once compute the same
 *    number. `nextval` is atomic and never hands the same value out twice —
 *    that is the entire reason a sequence is here rather than a count.
 *  · It must stay INSIDE this transaction. Pulled out, cached, or pre-fetched
 *    into a pool of "next ids", a failed insert leaves the number consumed by
 *    nobody at best and reused at worst.
 *  · The sequence must never be reset or recreated. It stood at 356 with
 *    LD-0355 issued. A reset — or a substitute that counts rows — hands the
 *    next return an id that ALREADY EXISTS; the unique index on `display_id`
 *    then rejects the insert and entry stops dead for everyone until somebody
 *    works out where the counter went. `nextval` legitimately skips numbers on
 *    a rolled-back transaction: a gap in the ids is normal, and is not a fault
 *    to "fix" by winding the sequence back.
 *
 * `createdBy` is a FK into `goods_return.users`, NOT an `ld_erp_core.users.id`
 * — passing a shell user id here points the row at whichever Goods Return
 * account happens to hold that number. `null` is legitimate and is what all
 * 341 pre-ERP rows carry.
 */
export async function insertReturn(
  data: ReturnInput,
  opts: { createdBy: number | null; attachmentUrl: string | null },
): Promise<{ id: number; displayId: string }> {
  const qname = await qualityNameMap(data.items);

  return goodsReturnDb.transaction(async (tx) => {
    const seq = await tx.execute<{ n: string | number }>(
      sql`select nextval('goods_return.return_display_seq') as n`,
    );
    const n = Number(seq[0]?.n);
    // Guard rather than let a bad read through: `Number(undefined)` is NaN and
    // padStart would happily produce "LD-0NaN", which the unique index accepts
    // — a permanently wrong id on a live row is worse than a refused entry.
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error("Could not allocate a return id from the sequence.");
    }
    const displayId = "LD-" + String(n).padStart(4, "0");

    const [ret] = await tx
      .insert(returns)
      .values({
        displayId,
        billNo: data.billNo || null,
        entryFor: data.entryFor,
        trackingNo: data.trackingNo || null,
        dated: data.dated,
        postedOn: data.postedOn || null,
        partyId: data.partyId,
        brokerId: data.brokerId,
        transportId: data.transportId ?? null,
        // The numeric columns round-trip as strings; handing drizzle a JS
        // number is how a rupee value picks up float drift on the way in.
        totalValue: data.totalValue?.toString() ?? null,
        transportValue: data.transportValue?.toString() ?? null,
        otherCharges: data.otherCharges?.toString() ?? null,
        returnReason: data.returnReason,
        // Only meaningful for "Other", and cleared otherwise so a reason
        // changed during entry cannot leave a stale free-text note behind it.
        customReason:
          data.returnReason === "Other" ? data.customReason || null : null,
        attachmentUrl: opts.attachmentUrl,
        // A new return is always in transit. Every screen calls this
        // "Pending"; it becomes "received" only through Bhiwandi's receiving
        // flow, never through entry and never through an edit.
        status: "posted",
        createdBy: opts.createdBy,
      })
      .returning({ id: returns.id });

    await tx.insert(returnItems).values(
      data.items.map((it) => ({
        returnId: ret.id,
        qualityId: it.qualityId,
        qualityName: qname.get(it.qualityId) ?? null,
        quantity: it.quantity.toString(),
        pieces: it.pieces ?? null,
      })),
    );

    return { id: ret.id, displayId };
  });
}

/**
 * Updates an existing return's editable fields and fully replaces its item
 * lines. `attachmentUrl` of `undefined` keeps the existing attachment (`null`
 * clears it) — the two cases are different and must not be collapsed.
 *
 * ── WHAT AN EDIT MUST NOT TOUCH, AND WHY ─────────────────────────────────
 *
 * The `set` below lists every column an edit may change. Everything absent
 * from it is absent deliberately:
 *
 *  · `displayId` — the id is printed on paper and quoted back by the party.
 *    It is issued once, by the sequence, and never re-issued.
 *  · `status` — writing it here would UN-RECEIVE a return Bhiwandi has already
 *    booked in, because head office fixed a bill number.
 *  · `receivedBy` / `receivedAt` / `receivingNotes` — the record of who took
 *    delivery and when. Not head office's to overwrite from an edit form.
 *  · `bhiwandiTransportValue` / `bhiwandiCharges` — what Bhiwandi ACTUALLY
 *    paid, as against the `transportValue` / `otherCharges` head office
 *    expected. The gap between the two pairs is a real number the business
 *    reports on, and an edit that reset the Bhiwandi side would silently
 *    destroy it.
 *  · `createdBy` / `createdAt` — who raised it, and when. An edit is not a
 *    re-entry; the author does not change because somebody corrected a typo.
 *
 * The lines themselves ARE replaced wholesale (delete, then insert) rather
 * than diffed: the form posts the full set every time, and matching rows up by
 * position would silently reassign quantities when a line is removed from the
 * middle. `return_items.id` is shown nowhere, so nothing depends on it
 * surviving.
 *
 * There is no "does this id exist" check because there is no gap for one to
 * close: against a missing id the update and delete match zero rows and the
 * line insert then violates the FK on `return_items.return_id`, so the whole
 * transaction rolls back.
 */
export async function updateReturnRecord(
  id: number,
  data: ReturnInput,
  opts: { attachmentUrl?: string | null },
): Promise<void> {
  const qname = await qualityNameMap(data.items);

  await goodsReturnDb.transaction(async (tx) => {
    await tx
      .update(returns)
      .set({
        billNo: data.billNo || null,
        entryFor: data.entryFor,
        trackingNo: data.trackingNo || null,
        dated: data.dated,
        postedOn: data.postedOn || null,
        partyId: data.partyId,
        brokerId: data.brokerId,
        transportId: data.transportId ?? null,
        totalValue: data.totalValue?.toString() ?? null,
        transportValue: data.transportValue?.toString() ?? null,
        otherCharges: data.otherCharges?.toString() ?? null,
        returnReason: data.returnReason,
        customReason:
          data.returnReason === "Other" ? data.customReason || null : null,
        // Spread, not a plain assignment: `undefined` means "the form sent no
        // file", and writing it through would clear the attachment on every
        // ordinary edit.
        ...(opts.attachmentUrl !== undefined
          ? { attachmentUrl: opts.attachmentUrl }
          : {}),
      })
      .where(eq(returns.id, id));

    await tx.delete(returnItems).where(eq(returnItems.returnId, id));
    await tx.insert(returnItems).values(
      data.items.map((it) => ({
        returnId: id,
        qualityId: it.qualityId,
        qualityName: qname.get(it.qualityId) ?? null,
        quantity: it.quantity.toString(),
        pieces: it.pieces ?? null,
      })),
    );
  });
}
