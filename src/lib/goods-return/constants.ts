/**
 * Fixed option lists, ported verbatim from the standalone app's
 * `lib/constants.ts`. Both lists are plain `varchar` columns in
 * `goods_return.returns` — there is no CHECK constraint and no Postgres enum
 * behind either of them, so these arrays are the ONLY thing keeping the
 * spelling stable across 341 live rows.
 *
 * ── DO NOT EDIT A STRING HERE. DO NOT REMOVE AN OPTION. ───────────────────
 *
 * Counted on the live schema, 4 Sep 2026:
 *
 *     entry_for                          reason
 *     ─────────────────────────          ──────────────────────────────
 *     Lorry Receipt (LR)      266        Bad Quality                 300
 *     Local Delivery           69        Incorrect Designs Received   29
 *     Letter Pad                6        Other                         6
 *                             ───        Wrong Delivery                6
 *                             341                                    ───
 *                                                                    341
 *
 * Every one of those rows stores the option as TEXT. Renaming "Lorry Receipt
 * (LR)" to "Lorry Receipt", or dropping "Letter Pad" because six looks like a
 * rounding error, does not tidy anything: it makes those rows fail
 * `returnInputSchema` the next time anybody edits one, and their filter chip
 * disappears from the list screen while the rows stay in the table. A tidy-up
 * would have to UPDATE live records first, and that is the class of change
 * this port rules out.
 *
 * The ORDER is the dropdown's order and is the standalone app's, not the
 * frequency order above — the two apps write to the same table and their entry
 * forms should not disagree about which option sits where.
 */

export const ENTRY_FOR_OPTIONS = [
  "Lorry Receipt (LR)",
  "Letter Pad",
  "Local Delivery",
] as const;

export const RETURN_REASONS = [
  "Bad Quality",
  "Wrong Delivery",
  "Incorrect Designs Received",
  "Other",
] as const;

/**
 * Derived rather than re-typed, so a value can never be added to one of the
 * lists above and missed here. Same idiom as `ReturnStatus` in
 * `src/db/goods-return/schema.ts`.
 */
export type EntryForOption = (typeof ENTRY_FOR_OPTIONS)[number];
export type ReturnReason = (typeof RETURN_REASONS)[number];
