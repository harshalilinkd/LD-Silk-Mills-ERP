// CSV helpers — docs/SCREENS.md §3.11, §4A.9
//
// Every export on every screen goes through these, so the files are identical
// in shape whatever produced them.
//
// `download()` prepends a **UTF-8 BOM**. Without it Excel on Windows opens a
// UTF-8 CSV in the system ANSI codepage, and the two things these files are
// full of break: the rupee sign becomes `â‚¹` and party names with anything
// outside ASCII turn to mojibake. The BOM is the only reliable signal Excel
// honours — the `charset=utf-8` on the blob type is not enough, because the
// file reaches Excel through the filesystem with no MIME type attached.
//
// This replaces the ad-hoc csvCell/download pair that
// components/order-entry/order-status/export-csv-button.tsx carries today;
// that copy omits the BOM.

export type CsvValue = string | number | null | undefined;

/**
 * Quotes any value containing `"`, `,` or a newline, doubling inner quotes —
 * the RFC 4180 escape. Everything else passes through bare, which keeps the
 * file readable in a text editor.
 */
export function csvCell(value: CsvValue): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Joins a header row + body rows into one CSV string. */
export function toCsv(rows: readonly CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * UTF-8 byte-order mark, written as an escape rather than a literal so it
 * survives any editor or tool that would strip an invisible U+FEFF from the
 * source. See the note at the top of the file for why it matters.
 */
export const CSV_BOM = "\uFEFF";

/** Triggers a browser download of `csv` as `filename`. */
export function download(csv: string, filename: string): void {
  const blob = new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Appended to the document before clicking: a detached <a> is a no-op in
  // Firefox, which is how this silently did nothing there once.
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `orders` → `orders-2026-09-02.csv`. Every export filename is date-stamped. */
export function csvFilename(prefix: string, date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.csv`;
}
