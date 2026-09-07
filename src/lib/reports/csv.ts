import { csvValue } from "./format";
import type { ReportColumn, ReportRow } from "./types";

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

/** RFC 4180 quoting, plus the formula-injection guard. */
function cell(value: string): string {
  const needsGuard = /^[=+\-@\t\r]/.test(value);
  const v = needsGuard ? `'${value}` : value;
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => cell(c.label)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => cell(csvValue(row[c.key], c.type))).join(","));
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
