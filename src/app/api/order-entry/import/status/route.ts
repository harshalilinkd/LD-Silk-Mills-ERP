// Writing the old Google Sheet's PRODUCTION STATUS onto lines that already
// exist. The second pass over the same workbook; the first is `../route.ts`.
//
// ═══════════════════════════════════════════════════════════════════════════
//  THIS ROUTE ONLY EVER TICKS. IT NEVER UNTICKS, AND NEVER CREATES.
// ═══════════════════════════════════════════════════════════════════════════
//
// Two properties, and everything else here rests on them.
//
// It creates nothing. A row whose order is not in the system is REPORTED, not
// inserted — the orders sheet is the thing that creates orders, and a status
// import that quietly invented one would produce an order with stage ticks and
// no party, date or value.
//
// It never clears a tick. The sheet is half a financial year old; if somebody
// has since ticked a stage in the new system, a blank in the sheet is the sheet
// being out of date, not an instruction to undo their work. That is also what
// makes the file safe to run twice, and safe to run against the live table on
// an ordinary working day.
//
// ── THE MATCH IS RE-MADE HERE, AGAINST FRESH ROWS ────────────────────────
//
// The browser posts the sheet rows it collected, never the plan it drew. Every
// judgement that depends on the database — which line a row belongs to, which
// stages are already done, what each planned date is — is made again in this
// request. See `CollectedRow` in `status-build.ts` for what the browser is
// allowed to do first and why that does not weaken this.

import { and, eq, inArray } from "drizzle-orm";

import { jsonData, jsonError, requireCapability } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import {
  customerOrders,
  lineStageProgress,
  orderLineItems,
} from "@/db/order-entry/schema";
import {
  planStatusRows,
  type CollectedRow,
  type ExistingLine,
  type StatusColumnMap,
} from "@/lib/order-entry/import/status-build";
import type { StatusLayout } from "@/lib/order-entry/import/status-layout";
import { db as coreDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { STAGE_KEYS } from "@/lib/order-entry/workflow";

export const maxDuration = 60;

/** As many order numbers as one lookup will answer for. */
const MAX_ORDER_NOS = 2000;
/** As many sheet rows as one write batch will take. */
const MAX_ROWS = 1500;

type Body = {
  action?: unknown;
  orderNos?: unknown;
  rows?: unknown;
  layout?: unknown;
  map?: unknown;
};

/**
 * Every line of the named orders, with the stage rows it already has.
 *
 * Only the orders the FILE names — the table holds 6,466 lines and 45,262
 * stage rows, and shipping all of that to a browser to draw a preview would be
 * several megabytes for a file that mentions a few hundred of them.
 */
async function loadLines(orderNos: string[]): Promise<ExistingLine[]> {
  if (!orderNos.length) return [];

  const rows = await db
    .select({
      id: orderLineItems.id,
      orderNo: customerOrders.orderNo,
      quality: orderLineItems.quality,
      designNo: orderLineItems.designNo,
      qtyMtr: orderLineItems.qtyMtr,
      // Carried so the plan can tell "the same order" from "the same NUMBER"
      // — the two sheets' numbering overlaps. See StatusColumnMap.
      orderDate: customerOrders.orderDate,
      partyName: customerOrders.partyName,
      isDeleted: orderLineItems.isDeleted,
    })
    .from(orderLineItems)
    .innerJoin(customerOrders, eq(customerOrders.id, orderLineItems.orderId))
    .where(inArray(customerOrders.orderNo, orderNos));

  // A soft-deleted line is not a line. Ticking stages on one would put work
  // against something the trash screen says was removed.
  const live = rows.filter((r) => !r.isDeleted);
  if (!live.length) return [];

  const stageRows = await db
    .select({
      orderLineItemId: lineStageProgress.orderLineItemId,
      stageKey: lineStageProgress.stageKey,
      plannedAt: lineStageProgress.plannedAt,
      isDone: lineStageProgress.isDone,
    })
    .from(lineStageProgress)
    .where(
      inArray(
        lineStageProgress.orderLineItemId,
        live.map((r) => r.id),
      ),
    );

  const byLine = new Map<string, ExistingLine["stages"]>();
  for (const s of stageRows) {
    let m = byLine.get(s.orderLineItemId);
    if (!m) {
      m = {};
      byLine.set(s.orderLineItemId, m);
    }
    m[s.stageKey] = {
      plannedAt: s.plannedAt ? s.plannedAt.toISOString() : null,
      isDone: s.isDone,
    };
  }

  return live.map((r) => ({
    id: r.id,
    orderNo: r.orderNo,
    quality: r.quality,
    designNo: r.designNo,
    qtyMtr: String(r.qtyMtr),
    orderDate: String(r.orderDate ?? "").slice(0, 10),
    partyName: r.partyName ?? "",
    stages: byLine.get(r.id) ?? {},
  }));
}

async function audit(
  email: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  let userId: string | null = null;
  if (email) {
    const [u] = await coreDb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    userId = u?.id ?? null;
  }
  await coreDb.insert(auditLogs).values({
    userId,
    action: "order-entry.status-imported",
    systemCode: "order-entry",
    metadata: { ...detail, by: email },
  });
}

export async function POST(req: Request) {
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("That request was not readable JSON.");
  }

  // ── the lookup: what does the system already have for these orders? ─────
  if (body.action === "lookup") {
    if (!Array.isArray(body.orderNos))
      return jsonError("`orderNos` has to be a list of order numbers.");
    const nos = [...new Set(body.orderNos.map((n) => String(n).trim()).filter(Boolean))];
    if (nos.length > MAX_ORDER_NOS)
      return jsonError(
        `That file names ${nos.length.toLocaleString("en-IN")} orders. The importer looks up ${MAX_ORDER_NOS.toLocaleString("en-IN")} at a time — split it by month and run it twice.`,
      );
    return jsonData({ lines: await loadLines(nos) });
  }

  if (body.action !== "write") return jsonError("Unknown action.");

  const rows = body.rows as CollectedRow[] | undefined;
  const layout = body.layout as StatusLayout | undefined;
  const map = body.map as StatusColumnMap | undefined;

  if (!Array.isArray(rows) || !rows.length)
    return jsonError("No rows were sent.");
  if (rows.length > MAX_ROWS)
    return jsonError(
      `That batch has ${rows.length.toLocaleString("en-IN")} rows; the limit is ${MAX_ROWS.toLocaleString("en-IN")}.`,
    );
  if (!layout || !Array.isArray(layout.blocks) || !layout.blocks.length)
    return jsonError("The stage column layout was missing from that request.");
  if (!map || map.design_no == null || map.order_no == null)
    return jsonError("The order number and design columns have to be mapped.");

  // ── judge it again, here, against rows read in THIS request ─────────────
  const orderNos = [...new Set(rows.map((r) => String(r.orderNo ?? "").trim()).filter(Boolean))];
  const lines = await loadLines(orderNos);
  const plan = planStatusRows({ rows, layout, map, lines });

  const results: {
    line: number;
    orderNo: string;
    designNo: string;
    status: "updated" | "nothing" | "error";
    stages?: number;
    reason?: string;
  }[] = [];

  let stagesWritten = 0;
  let backfilled = 0;

  for (const r of plan.rows) {
    if (r.verdict === "error" || !r.lineId) {
      results.push({
        line: r.line,
        orderNo: r.orderNo,
        designNo: r.designNo,
        status: "error",
        reason: r.issues.find((i) => i.level === "error")?.message ?? "refused",
      });
      continue;
    }
    const toWrite = r.stages.filter((s) => s.write);
    if (!toWrite.length) {
      results.push({ line: r.line, orderNo: r.orderNo, designNo: r.designNo, status: "nothing" });
      continue;
    }

    try {
      // One LINE, one transaction. All-or-nothing across a whole file would
      // mean one unreadable cell throws away the work; per line lets the report
      // name exactly which rows did not go in.
      await db.transaction(async (tx) => {
        for (const s of toWrite) {
          await tx
            .update(lineStageProgress)
            .set({
              isDone: true,
              actualAt: s.actualAt ? new Date(s.actualAt) : null,
              delayMinutes: s.delayMinutes,
              // Only stock checking carries one; every other stage keeps its
              // existing value rather than being nulled by a blanket update.
              ...(s.stockStatus ? { stockStatus: s.stockStatus } : {}),
              updatedBy: guard.user.email ?? guard.user.name ?? null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(lineStageProgress.orderLineItemId, r.lineId as string),
                eq(lineStageProgress.stageKey, s.stageKey),
                // ── THE NEVER-UNTICK RULE, ENFORCED IN THE STATEMENT ─────
                //
                // The plan already decided not to touch a stage somebody has
                // ticked since. Saying it again in the WHERE means a row that
                // was ticked in the seconds between the read above and this
                // write updates nothing, instead of having its actual date
                // replaced by the sheet's.
                eq(lineStageProgress.isDone, false),
              ),
            );
        }
      });
      stagesWritten += toWrite.length;
      backfilled += toWrite.filter((s) => s.source === "backfill").length;
      results.push({
        line: r.line,
        orderNo: r.orderNo,
        designNo: r.designNo,
        status: "updated",
        stages: toWrite.length,
      });
    } catch (e) {
      results.push({
        line: r.line,
        orderNo: r.orderNo,
        designNo: r.designNo,
        status: "error",
        reason: e instanceof Error ? e.message : "the write failed",
      });
    }
  }

  const updated = results.filter((r) => r.status === "updated").length;
  await audit(guard.user.email ?? null, {
    rows: rows.length,
    linesUpdated: updated,
    stagesTicked: stagesWritten,
    backfilled,
    unmatched: plan.counts.unmatched,
  });

  return jsonData({
    results,
    counts: { ...plan.counts, linesUpdated: updated, stagesWritten, backfilled },
    fileIssues: plan.fileIssues,
  });
}

export async function GET() {
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;
  return jsonData({ stages: STAGE_KEYS });
}
