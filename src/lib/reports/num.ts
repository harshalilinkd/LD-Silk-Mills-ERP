/**
 * Two coercions every report needs, in one place so no module can drift.
 *
 * Postgres `numeric` arrives over the wire as a STRING. `Number(null)` is 0
 * but `Number(undefined)` is NaN, and a NaN that reaches a workbook prints as
 * `#NUM!` in a cell nobody expected to be a formula — so nulls are pinned to
 * zero here rather than in each caller.
 */

/** A numeric column as a number. Null and undefined become 0, never NaN. */
export const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Two decimals, applied where the ROW is built — not left to a cell format.
 *
 * The CSV has no cell format to hide behind, so a rate stored as
 * `190.58064516129033` would go into the file at full precision and read as a
 * mistake. Null stays null: a rate that cannot be computed is a dash, not 0.
 */
export const money2 = (v: string | number | null | undefined) =>
  v == null ? null : Math.round(Number(v) * 100) / 100;
