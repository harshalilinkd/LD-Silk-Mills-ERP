import "server-only";

import { sql as pg } from "@/db";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The pieces every Order Entry report needs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Six reports over the same three tables. What is shared here is not just
 * convenience — it is the definitions that must not drift. "Live line",
 * "reached", and what the delay column actually measures have to mean the same
 * thing on all six, or two reports disagree and nobody knows which to believe.
 *
 * "Finished" is the one that got away for a while and it is worth naming: it
 * means THE LAST STAGE IS TICKED, never "all seven are ticked". 33 lines have
 * Dispatch ticked with an earlier stage skipped, and counting ticks instead
 * made one dashboard print two different numbers of open lines.
 */

// `n` and `money2` moved to `../num` when the second module needed them, and
// are re-exported here so the six Order Entry reports import unchanged. Two
// modules with their own copy of "how a numeric becomes a number" is exactly
// how two reports end up disagreeing about a null.
export { money2, n } from "../num";

/**
 * A LIVE line: not deleted, not cancelled.
 *
 * Deleted is a mistake being unmade and is excluded everywhere. Cancelled is a
 * real event and is REPORTED — it is simply kept out of value, quantity and
 * rate so those describe what will actually be delivered.
 */
export const LIVE_LINE = "not li.is_deleted and not li.is_cancelled";

export const STAGES = [
  { key: "order_entry", label: "Order Entry" },
  { key: "stock_checking", label: "Stock Checking" },
  { key: "rolling_checking", label: "Rolling & Checking" },
  { key: "challan", label: "Challan" },
  { key: "bill", label: "Bill" },
  { key: "dispatch", label: "Dispatch" },
  { key: "received_lr", label: "Received LR" },
] as const;

/**
 * ── THE CAVEAT THAT MUST RIDE ON ANY STAGE-DATE REPORT ───────────────────
 *
 * Measured across all 41,000 stage rows before this module was written: 96% of
 * completed stages read as late against their planned date, and the median
 * time from the first stage to the last is ZERO DAYS. Both facts have one
 * cause — a great many lines had all seven stages ticked in a single sitting
 * while the backlog was caught up in the app. The "actual" date is when
 * somebody pressed the button, so against a plan measured from the order date
 * almost everything is late by roughly the age of the backlog.
 *
 * That does not make the data useless; it makes the LABEL a lie if it says
 * "on time". So every report touching these dates says "recorded on time",
 * carries this sentence, and — where it computes a cycle time — offers the
 * honest version alongside: lines whose stages were ticked on DIFFERENT days,
 * which is the subset where the timestamps describe work rather than typing.
 */
export const RECORDED_CAVEAT =
  "“Recorded on time” compares when a stage was TICKED against its planned date — not when the work happened. " +
  "A great many lines had every stage ticked in one sitting while the backlog was caught up, so 96% of stages read as late " +
  "and the median start-to-finish time is zero days. Treat these as a record of data entry until stages are ticked as work happens.";

export const CANCELLED_CAVEAT =
  "Value, metres and rate exclude cancelled lines, so they describe what should actually be delivered. Cancelled figures are reported separately.";

/**
 * The distinct values of one column, for a dropdown.
 *
 * The column name is a LITERAL passed from the report definition, never from a
 * request — `pg.unsafe` is interpolating our own constant, and the caller list
 * is short enough to read. Anything from the browser is bound as a parameter.
 */
export async function distinctValues(
  column: "party_name" | "agent" | "sales_person" | "transport" | "haste",
): Promise<{ value: string; label: string }[]> {
  const rows = await pg.unsafe(
    `select distinct ${column} as v from ld_order_entry.customer_orders
      where ${column} is not null and ${column} <> '' order by 1`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
}

export async function distinctLineValues(
  column: "quality" | "design_no",
): Promise<{ value: string; label: string }[]> {
  const rows = await pg.unsafe(
    `select distinct ${column} as v from ld_order_entry.order_line_items
      where ${column} is not null and ${column} <> '' and not is_deleted order by 1 limit 3000`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
}

/** The five filters every order-level report shares, bound as $3..$7. */
export const ORDER_FILTER_SQL = `
    and ($3::text is null or o.party_name   = $3::text)
    and ($4::text is null or o.agent        = $4::text)
    and ($5::text is null or o.sales_person = $5::text)`;

export function orderFilterArgs(params: Record<string, string | undefined>) {
  return [
    params.from ?? null,
    params.to ?? null,
    params.party ?? null,
    params.agent ?? null,
    params.salesPerson ?? null,
  ];
}

/** Days between two instants, or null when either is missing. */
export function daysBetweenIso(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
}
