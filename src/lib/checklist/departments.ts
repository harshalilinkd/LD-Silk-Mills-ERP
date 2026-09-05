import "server-only";

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers } from "@/db/checklist/schema";
import { orderEntryDb } from "@/db/order-entry";
import { lookupValues } from "@/db/order-entry/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What goes in the Department dropdown
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TWO SOURCES, MERGED — and the second one is what stops the dropdown being a
 * dead end.
 *
 *   1. `CRM_DEPT` in Masters — the company department list, edited in one
 *      place and used everywhere. That is the owner's own decision, recorded
 *      on the Masters screen, and this module has no business keeping a rival
 *      list beside it.
 *
 *   2. Whatever departments the checklist's own people are ALREADY in. The
 *      Masters list holds six broad departments; the duties on a checklist
 *      are organised more finely than that — Housekeeping, Fusing, DEO — and
 *      a dropdown that could not offer those would send somebody to a
 *      different screen mid-task just to add one.
 *
 * ── WHY NOTHING IS WRITTEN BACK TO MASTERS ───────────────────────────────
 *
 * Typing a new department on a doer does NOT add it to `CRM_DEPT`. That table
 * lives in `ld_order_entry`, which is shared with a live standalone app, and
 * a value added here would silently appear in CRM's own department dropdown
 * as well. Instead the new value is simply saved on that person — and because
 * source 2 reads back what is in use, it is in the dropdown for the next
 * person anyway. Self-populating, with no write into somebody else's schema.
 */
export async function getDepartmentOptions(): Promise<string[]> {
  // Two reads, in turn. Never concurrently — the pool holds five connections
  // and pipelined statements stall under the transaction pooler.
  const master = await orderEntryDb
    .select({ value: lookupValues.value })
    .from(lookupValues)
    .where(
      and(eq(lookupValues.category, "CRM_DEPT"), eq(lookupValues.isActive, true)),
    )
    .orderBy(asc(lookupValues.value));

  const inUse = await checklistDb
    .selectDistinct({ value: doers.department })
    .from(doers)
    .where(isNotNull(doers.department));

  // Case-insensitive de-duplication, keeping whichever spelling Masters uses —
  // otherwise "accounts" typed on one doer stands beside "Accounts" forever
  // and the two never add up on a scorecard.
  const seen = new Map<string, string>();
  for (const r of [...master, ...inUse]) {
    const v = r.value?.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
