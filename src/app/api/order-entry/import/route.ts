// Writing the old Google Sheet's orders into the live tables.
//
// ═══════════════════════════════════════════════════════════════════════════
//  THE SERVER RE-READS THE ROWS. THE PREVIEW IS A COURTESY, NEVER A CHECK.
// ═══════════════════════════════════════════════════════════════════════════
//
// The browser posts the RAW CELLS and the mapping, not the plan it drew. This
// route runs `buildPlan` again, against order numbers and master lists read
// fresh in this request. The checklist importer settled the same rule and for
// the same reason: a preview built minutes ago describes a database that has
// moved, and a client is a thing somebody can edit before it posts.
//
// ── IT IS SAFE TO RUN TWICE, AND THAT IS THE DESIGN ───────────────────────
//
// An order number already present is SKIPPED (the owner's choice), so a second
// run of the same file adds nothing. That property is what lets the browser
// send the file in batches instead of one enormous request: a batch that fails
// halfway leaves the orders it did write, and running the file again picks up
// exactly the ones that are missing. Nothing has to be undone by hand.
//
// Each ORDER is its own transaction. All-or-nothing across four hundred orders
// would mean one bad row throws away an afternoon; per-order means the report
// can say precisely which three did not go in and why.
//
// ── BATCHES MUST START ON AN ORDER BOUNDARY ───────────────────────────────
//
// A continuation row inherits its order number from the row above it, so a
// batch that begins in the middle of an order would lose the rows before the
// split into a second, differently-numbered order — or drop them entirely. The
// browser slices on order boundaries; this route re-checks by refusing a first
// row that carries no order number.

import { inArray } from "drizzle-orm";

import { jsonData, jsonError, requireCapability } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import {
  customerOrders,
  designDatabase,
  lineStageProgress,
  lookupValues,
  orderLineItems,
  workflowStages,
} from "@/db/order-entry/schema";
import { buildInitialStageRows } from "@/lib/order-entry/workflow";
import { buildPlan, orderKey, type MasterLists } from "@/lib/order-entry/import/build";
import { normaliseName } from "@/lib/order-entry/import/coerce";
import { IMPORT_FIELDS } from "@/lib/order-entry/import/fields";
import type { ColumnMap } from "@/lib/order-entry/import/types";
import { db as coreDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// A batch of a few hundred orders is several hundred small statements against
// a five-wide pool. 60s is the Hobby ceiling and well inside Pro's.
export const maxDuration = 60;

const MASTER_CATEGORIES = [
  "PARTY",
  "FABRIC",
  "AGENT",
  "SALES_PERSON",
  "TRANSPORT",
  "HASTE",
] as const;

type Body = {
  rows?: unknown;
  map?: unknown;
  firstLine?: unknown;
  /** Names to add to the master lists before writing. First batch only. */
  addMasters?: unknown;
};

function badRequest(msg: string) {
  return jsonError(msg, 422);
}

export async function POST(req: Request) {
  // ADMIN or `orders.edit`. This writes orders, so it is the same permission
  // as raising one — it simply raises four hundred.
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return badRequest("Send a JSON body.");

  const rows = body.rows;
  const map = body.map as ColumnMap | undefined;
  const firstLine = typeof body.firstLine === "number" ? body.firstLine : 2;

  if (!Array.isArray(rows) || !rows.every((r) => Array.isArray(r)))
    return badRequest("`rows` must be an array of arrays of cells.");
  if (!map || typeof map !== "object") return badRequest("`map` is missing.");
  if (map.order_no == null || map.order_date == null || map.party_name == null)
    return badRequest("Order no, order date and party have to be mapped.");
  if (map.quality == null || map.design_no == null || map.qty_mtr == null)
    return badRequest("Fabric, design no and qty have to be mapped.");

  const cells = rows as string[][];
  if (cells.length === 0) return jsonData({ added: 0, skipped: 0, failed: 0, results: [] });

  // The boundary rule above, enforced rather than assumed.
  const firstNo = String(cells[0][map.order_no as number] ?? "").trim();
  if (!firstNo)
    return badRequest(
      "The first row of a batch has to carry its own order number, or the rows above it are lost.",
    );

  // ── names the person ticked to add to the master lists ──────────────────
  let mastersAdded = 0;
  if (Array.isArray(body.addMasters) && body.addMasters.length) {
    const wanted = (body.addMasters as { category?: unknown; value?: unknown }[])
      .map((m) => ({ category: String(m.category ?? ""), value: String(m.value ?? "").trim() }))
      .filter(
        (m) =>
          m.value &&
          m.value.length <= 200 &&
          (MASTER_CATEGORIES as readonly string[]).includes(m.category),
      );
    if (wanted.length) {
      // `onConflictDoNothing` against the (category, value) unique index, so a
      // second run of the same file cannot duplicate a list entry.
      await db
        .insert(lookupValues)
        .values(wanted.map((m) => ({ category: m.category, value: m.value })))
        .onConflictDoNothing();
      mastersAdded = wanted.length;
    }
  }

  // ── read what the plan has to be judged against, FRESH ──────────────────
  const masters = await loadMasters();
  const numbers = new Set<string>();
  for (const r of cells) {
    const no = String(r[map.order_no as number] ?? "").trim();
    if (no) numbers.add(no);
  }
  const existing = await loadExistingOrderNos([...numbers]);

  const plan = buildPlan({
    rows: cells,
    map,
    existingOrderNos: existing,
    masters,
    firstLine,
  });

  // ── the stage offsets, read once for the whole batch ────────────────────
  const offRows = await db
    .select({ stageKey: workflowStages.stageKey, off: workflowStages.plannedOffsetDays })
    .from(workflowStages);
  const offsets = Object.fromEntries(offRows.map((r) => [r.stageKey, r.off]));

  const results: {
    orderNo: string;
    status: "added" | "skipped" | "error";
    lines?: number;
    reason?: string;
  }[] = [];

  for (const o of plan.orders) {
    if (o.verdict === "skip") {
      results.push({ orderNo: o.orderNo, status: "skipped", reason: "already in the system" });
      continue;
    }
    if (o.verdict === "error") {
      results.push({
        orderNo: o.orderNo,
        status: "error",
        reason: o.issues.find((i) => i.level === "error")?.message ?? "refused",
      });
      continue;
    }

    try {
      // One order, one transaction — see the header.
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(customerOrders)
          .values({
            orderNo: o.orderNo,
            orderDate: o.orderDate!,
            partyName: o.partyName,
            salesPerson: o.salesPerson,
            agent: o.agent,
            haste: o.haste,
            transport: o.transport,
            challanNo: o.challanNo,
            lotNo: o.lotNo,
            // Unmapped in the sheet, this stays undefined so the column's own
            // default (`LD`) applies — writing null would violate NOT NULL.
            ...(o.department ? { department: o.department } : {}),
            remarks: o.remarks,
            // Attribution is the person who ran the import, the same column the
            // form fills. It holds an EMAIL as text, not a foreign key.
            createdBy: guard.user.email ?? guard.user.name ?? null,
          })
          .returning({ id: customerOrders.id });

        const orderId = created.id;

        const lineValues = o.items.map((l) => ({
          orderId,
          quality: l.quality,
          designNo: l.designNo,
          // numeric columns take strings — `line_total` is GENERATED
          // (qty_mtr * rate) and must never appear here.
          qtyMtr: String(l.qtyMtr),
          rate: l.rate == null ? null : String(l.rate),
          isCancelled: l.isCancelled,
          remarks: l.remarks,
        }));

        const inserted = await tx
          .insert(orderLineItems)
          .values(lineValues)
          .returning({ id: orderLineItems.id });

        // Every stage per line, exactly as the order form seeds them — eight
        // since `on_hold` was added, and `buildInitialStageRows` is the one
        // place that decides how many. An
        // order with no stage rows renders on the board as permanently "not
        // started" and can never be ticked.
        const stageValues = inserted.flatMap((l) =>
          buildInitialStageRows(l.id, o.orderDate!, offsets),
        );
        await tx.insert(lineStageProgress).values(stageValues);

        // And the design database, which is what the order form's design
        // autocomplete reads.
        const seen = new Set<string>();
        const designRows = lineValues.flatMap((lv) => {
          const k = `${lv.quality}__${lv.designNo}`;
          if (seen.has(k)) return [];
          seen.add(k);
          return [{ orderId, orderNo: o.orderNo, fabricName: lv.quality, designNo: lv.designNo }];
        });
        if (designRows.length)
          await tx.insert(designDatabase).values(designRows).onConflictDoNothing();
      });

      results.push({ orderNo: o.orderNo, status: "added", lines: o.items.length });
    } catch (e) {
      // A unique violation here means the order arrived between the read above
      // and this write — another batch, or somebody on the order form. That is
      // a SKIP, not a failure: the order exists, which is the outcome wanted.
      const dup =
        typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
      if (dup) {
        results.push({ orderNo: o.orderNo, status: "skipped", reason: "already in the system" });
      } else {
        console.error(`import: order ${o.orderNo} failed:`, e);
        results.push({
          orderNo: o.orderNo,
          status: "error",
          reason: e instanceof Error ? e.message : "the write failed",
        });
      }
    }
  }

  const added = results.filter((r) => r.status === "added").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;

  // An import that added nothing writes no audit row — a re-run over a file
  // already in the system is a no-op, and logging it as an event would fill the
  // trail with entries nobody caused.
  if (added > 0 || mastersAdded > 0) {
    await audit(guard.user.email ?? null, {
      added,
      skipped,
      failed,
      lines: results.reduce((n, r) => n + (r.lines ?? 0), 0),
      mastersAdded,
      orders: results.filter((r) => r.status === "added").map((r) => r.orderNo),
    }).catch((e) => console.error("import: audit write failed:", e));
  }

  return jsonData({
    added,
    skipped,
    failed,
    mastersAdded,
    lines: results.reduce((n, r) => n + (r.lines ?? 0), 0),
    results,
  });
}

async function loadMasters(): Promise<MasterLists> {
  const rows = await db
    .select({ category: lookupValues.category, value: lookupValues.value })
    .from(lookupValues)
    .where(inArray(lookupValues.category, [...MASTER_CATEGORIES]));

  const out = Object.fromEntries(
    MASTER_CATEGORIES.map((c) => [c, new Map<string, string>()]),
  ) as MasterLists;
  for (const r of rows) {
    const m = out[r.category as keyof MasterLists];
    if (!m) continue;
    const n = normaliseName(r.value);
    if (n && !m.has(n)) m.set(n, r.value);
  }
  return out;
}

/**
 * Which of these order numbers are already taken, and by WHOM.
 *
 * Compared through `orderKey`, so `1058`, `#1058` and `1058.0` in the sheet all
 * find the stored `1058`. The candidate list is built from BOTH the raw sheet
 * value and its normalised form, then both sides are normalised in JS — the
 * normalisation lives in one function that way, rather than being written once
 * in TypeScript and again, differently, in SQL.
 *
 * The party name and date ride along because a shared number is not always
 * the same order — see the note on `BuildInput.existingOrderNos` in
 * `build.ts`. Only one live order can hold a given number (it is UNIQUE in
 * the table), so a plain `Map` is enough; there is never a second one to
 * record against it.
 *
 * It asks about the numbers in THIS batch rather than reading the whole table:
 * 351 orders today, but this has to keep working at fifty thousand.
 */
async function loadExistingOrderNos(
  fromSheet: string[],
): Promise<Map<string, { partyName: string; orderDate: string }>> {
  if (fromSheet.length === 0) return new Map();

  const candidates = new Set<string>();
  for (const v of fromSheet) {
    candidates.add(v);
    candidates.add(v.trim());
    candidates.add(orderKey(v));
  }

  const rows = await db
    .select({ orderNo: customerOrders.orderNo, partyName: customerOrders.partyName, orderDate: customerOrders.orderDate })
    .from(customerOrders)
    .where(inArray(customerOrders.orderNo, [...candidates]));

  return new Map(
    rows.map((r) => [orderKey(r.orderNo), { partyName: r.partyName, orderDate: String(r.orderDate) }]),
  );
}

/**
 * One audit row in `ld_erp_core.audit_logs`, the same table every other module
 * writes to. `user_id` is a foreign key into the SHELL's users, while this
 * route authorises against `ld_order_entry.users` — two different tables that
 * happen to share an email — so the id is resolved by email and left NULL when
 * there is no shell account. The email is in the metadata either way, so the
 * row still says who ran it.
 */
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
    action: "order-entry.imported",
    systemCode: "order-entry",
    metadata: { ...detail, by: email },
  });
}

export async function GET() {
  const guard = await requireCapability("orders.edit");
  if (!guard.ok) return guard.response;
  const masters = await loadMasters();
  return jsonData({
    fields: IMPORT_FIELDS,
    masterCounts: Object.fromEntries(
      Object.entries(masters).map(([k, v]) => [k, (v as Map<string, string>).size]),
    ),
  });
}
