import "server-only";

import { sql as pg } from "@/db";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The pieces every Goods Return report needs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Six reports over `goods_return`, on six different grains: by return, by
 * item, by party, by reason, by fabric, by broker/transport. What is shared
 * here is the definitions that must not drift between them.
 *
 * ── FOUR THINGS THIS DATA DOES THAT A REPORT MUST NOT HIDE ───────────────
 *
 * Measured across all 341 returns before a line of this module was written:
 *
 *  1. **26 returns carry no value at all** (`total_value` null or zero). They
 *     are real returns with real fabric on them. Every money figure therefore
 *     says how many rows had no value behind it, rather than quietly counting
 *     them as ₹0 and dragging every average down.
 *  2. **72 returns were marked received BEFORE the date on the return.** They
 *     were entered after the fact while the old system was being caught up. A
 *     "days to receive" computed over those is negative, so it is left BLANK
 *     for them and the count of blanks is printed.
 *  3. **36 more are marked received with no received date at all.** They are
 *     counted as received — the status is the fact — and flagged, because a
 *     receiving report that silently drops 36 rows is worse than one that
 *     shows them.
 *  4. **One return is dated 2000-01-01**, which is a typing slip, not a
 *     twenty-six-year-old return. It is flagged rather than deleted; this repo
 *     does not edit the live Goods Return schema.
 *
 * ── WHO ENTERED IT IS NOT IN THIS SCHEMA ─────────────────────────────────
 *
 * `created_by` and `received_by` are integer FKs into `goods_return.users`
 * (three rows, two shared passwordless office logins) and are NULL on every
 * row. No report may offer a "who did this" column from them; attribution for
 * anything done through the ERP lives in `ld_erp_core.audit_logs`.
 */

export { money2, n } from "../num";

/**
 * The count is passed in, never frozen into the sentence.
 *
 * It used to read "26 of the returns on record carry no value", printed on the
 * Notes sheet of all three reports whatever period or filter was applied — a
 * number that was right on one run in September and wrong on every run after
 * it, sitting two lines above genuinely recomputed caveats.
 */
export const noValueCaveat = (withoutValue: number, of: number) =>
  `${withoutValue.toLocaleString("en-IN")} of the ${of.toLocaleString("en-IN")} returns in this file carry no value — the fabric came back but nothing was entered against it. ` +
  `They are counted as returns and left out of every money figure, so a value total is never dragged down by a blank.`;

export const BACKDATED_CAVEAT =
  "Some returns were entered after the fact while the old system was being caught up, so their received date falls before the return's own date. “Days to receive” is left blank for those rather than printed as a negative, and the dashboard says how many.";

export const RECEIVED_CAVEAT =
  "A return counts as received when its STATUS says so. A few are marked received with no date recorded; they are included in the count and flagged in their own column, because dropping them would understate what has come back.";

/** The date this business actually started recording returns. Anything before it is a slip. */
export const EARLIEST_SANE = "2024-01-01";

/**
 * ── FILTERS ──────────────────────────────────────────────────────────────
 *
 * `$1`/`$2` are the date range on the return's own date; the rest are exact
 * matches, all BOUND, never interpolated. The numbering is fixed so every
 * report can share `filterArgs` below and none of them can drift out of step
 * with the SQL.
 */
export const RETURN_FILTER_SQL = `
    and ($3::text is null or p.name = $3::text)
    and ($4::text is null or b.name = $4::text)
    and ($5::text is null or t.name = $5::text)
    and ($6::text is null or r.return_reason = $6::text)
    and ($7::text is null or r.status::text = $7::text)`;

export function filterArgs(params: Record<string, string | undefined>) {
  return [
    params.from ?? null,
    params.to ?? null,
    params.party ?? null,
    params.broker ?? null,
    params.transport ?? null,
    params.reason ?? null,
    params.status ?? null,
  ];
}

/**
 * The distinct values of one lookup, for a dropdown.
 *
 * Only names that actually appear on a return. The `parties` table holds 5,562
 * rows and fewer than 300 of them have ever had a return, so offering the
 * whole table would be a dropdown nobody can use to find anything.
 */
export async function distinctReturnValues(
  which: "party" | "broker" | "transport",
): Promise<{ value: string; label: string }[]> {
  const table = { party: "parties", broker: "brokers", transport: "transports" }[which];
  const column = { party: "party_id", broker: "broker_id", transport: "transport_id" }[which];
  const rows = await pg.unsafe(
    `select distinct x.name as v
       from goods_return.returns r
       join goods_return.${table} x on x.id = r.${column}
      where x.name is not null and x.name <> ''
      order by 1`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
}

export async function distinctReasons(): Promise<{ value: string; label: string }[]> {
  const rows = await pg.unsafe(
    `select distinct return_reason as v from goods_return.returns
      where return_reason is not null and return_reason <> '' order by 1`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
}

export async function distinctStatuses(): Promise<{ value: string; label: string }[]> {
  const rows = await pg.unsafe(
    `select distinct status::text as v from goods_return.returns order by 1`,
  );
  return (rows as unknown as { v: string }[]).map((r) => ({
    value: r.v,
    // The database stores `posted`/`received`; nobody says "posted" out loud.
    label: r.v === "posted" ? "Sent, not yet received" : "Received at Bhiwandi",
  }));
}

/** Whole days between two ISO dates, or null when either is missing. */
export function daysBetweenIso(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from.slice(0, 10));
  const b = Date.parse(to.slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
