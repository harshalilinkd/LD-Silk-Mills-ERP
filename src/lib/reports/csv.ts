import { csvValue, isNumeric } from "./format";
import type { ColumnType, ReportColumn, ReportRow } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CSV — the rows, and nothing else
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One header row, then data. No title, no date stamp, no blank spacer, no
 * merged anything, no totals row. Every one of those is helpful to a person
 * and fatal to a machine, and this format exists for the machine — a Tally
 * import, somebody's own pivot table, another system's loader.
 *
 * The person's version is the Excel one, which has all of it.
 *
 * ── THREE THINGS THAT GO WRONG WITH CSV, AND WHAT IS DONE ABOUT THEM ─────
 *
 * 1. **Indian names and ₹ arrive as mojibake.** Excel on Windows assumes the
 *    system codepage unless the file opens with a UTF-8 byte order mark. The
 *    BOM below is three bytes that make the difference between "SHRÎ" and
 *    "SHRĪ" for the person opening it.
 *
 * 2. **A leading `=`, `+`, `-` or `@` is executed.** A party named
 *    `=cmd|...` is a live formula the moment somebody opens the file, and it
 *    is a genuine attack because party names come from a shared list anybody
 *    with Masters can edit. Those cells are prefixed with a single quote,
 *    which Excel strips on display and never evaluates.
 *
 * 3. **Line endings.** CRLF, because that is what RFC 4180 says and what the
 *    Windows machines in the office expect.
 */

const BOM = "﻿";

/** Executed by Excel the moment the file opens. */
const EXECUTED = /^[=+@\t\r]/;

/**
 * Silently CHANGED by Excel on import, which is the quieter half of the
 * problem: a design number `01` becomes the number 1 and merges with a
 * different design, and a cloth quality literally named `TRUE` becomes a
 * boolean. Both are real in this data.
 */
const COERCED = /^0\d|^(?:TRUE|FALSE)$|^[-+]?\d+(?:\.\d+)?[eE]/i;

/** A value that is nothing but a number, and so cannot be a formula. */
const NUMBER_ONLY = /^-?\d+(?:\.\d+)?$/;

/**
 * RFC 4180 quoting, plus the formula-injection guard.
 *
 * ── A NEGATIVE NUMBER IS NOT AN ATTACK ───────────────────────────────────
 *
 * The guard fires on a leading `-`, and `-5.8` starts with one. Prefixing it
 * with an apostrophe turned 2,439 cells across the seven "days late" columns
 * of the production status file into TEXT — so the one format that exists for
 * machines handed Excel a column it would not add up, sort or average, and
 * nothing on screen said so.
 *
 * A value that is only digits, with an optional sign and decimal point, cannot
 * be a formula and is never guarded. Everything else still is: `-1+cmd|…` is
 * not a number and is caught, and so are `=`, `+`, `@`, tab and carriage
 * return at the start of any text.
 */
function cell(value: string, type?: ColumnType): string {
  // A NUMERIC column's value is a bare number we produced. It is never a
  // formula, and guarding it turned 2,439 negative "days late" cells into text
  // that Excel would not add up.
  const guardable = type === undefined || !isNumeric(type);
  const needsGuard =
    guardable &&
    (EXECUTED.test(value) ||
      COERCED.test(value) ||
      // A leading minus is only dangerous on something that is not a number.
      // A lone "-" is neither, and guarding it stopped the file round-tripping.
      (value.startsWith("-") && value.length > 1 && !NUMBER_ONLY.test(value)));

  const v = needsGuard ? `'${value}` : value;
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => cell(c.label, "text")).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => cell(csvValue(row[c.key], c.type), c.type)).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

/**
 * `order-register_2026-05-17_to_2026-09-05.csv`
 *
 * The range is in the NAME because these files end up in a folder together and
 * "report.csv" twice is how the wrong month gets sent to a customer.
 */
export function fileName(
  reportId: string,
  ext: "csv" | "xlsx",
  from?: string,
  to?: string,
  truncated = false,
): string {
  const base = reportId.replace(/^[a-z-]+\./, "").replace(/[^a-z0-9-]/gi, "-");
  const range = from && to ? `_${from}_to_${to}` : "";
  const cut = truncated ? "_PARTIAL" : "";
  return `${base}${range}${cut}.${ext}`;
}
