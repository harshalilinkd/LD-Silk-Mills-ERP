// A file the person chose, turned into rows. Runs in the BROWSER.
//
// ── WHY THE BROWSER AND NOT AN UPLOAD ─────────────────────────────────────
//
// Vercel refuses any request body over 4.5 MB before our code runs — the same
// cap that already forced petty cash receipts to go browser-to-storage. Half a
// financial year of orders is comfortably under that today, which is exactly
// the reasoning that made the receipts sheet ship with a limit it could not
// keep. Parsing here means the cap cannot apply at all: only the finished plan
// is posted, and that is JSON we control the size of.
//
// It also makes the preview instant. Nothing is sent anywhere until somebody
// has looked at the mapping and pressed the button.

import { parseDelimited, detectDelimiter } from "@/lib/checklist/import";
import type { SheetData } from "./types";

/** What the file picker should offer. */
export const ACCEPTED = ".csv,.tsv,.txt,.xlsx,.xls";

const MAX_ROWS = 60_000;

export class ImportFileError extends Error {}

/**
 * Header row → column names, with the blanks named rather than left empty.
 *
 * A sheet often has an unlabelled column (a spacer, or one somebody added and
 * never titled). An empty string in a dropdown is invisible and unpickable, so
 * each becomes "Column D" using its spreadsheet letter — which is also what
 * the person sees along the top of their own sheet.
 */
function headerNames(row: string[], width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const raw = (row[i] ?? "").trim();
    out.push(raw || `Column ${columnLetter(i)}`);
  }
  return out;
}

export function columnLetter(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Pad every row to the header width so a short row is blanks, not undefined. */
function rectangular(rows: string[][], width: number): string[][] {
  return rows.map((r) => {
    const out = new Array<string>(width);
    for (let i = 0; i < width; i++) out[i] = r[i] ?? "";
    return out;
  });
}

function toSheet(name: string, all: string[][]): SheetData {
  // The first row that has anything in it is the header. Sheets often carry a
  // title line or two above the real headings.
  const headerIdx = all.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return { name, headers: [], rows: [], raw: all };

  const width = all.reduce((w, r) => Math.max(w, r.length), 0);
  const headers = headerNames(all[headerIdx], width);
  const body = rectangular(all.slice(headerIdx + 1), width);
  return { name, headers, rows: body, raw: rectangular(all, width) };
}

async function parseText(name: string, text: string): Promise<SheetData[]> {
  const rows = parseDelimited(text, detectDelimiter(text), {
    // Blank rows are KEPT so every reported line number matches the person's
    // own sheet. `buildPlan` steps over them.
    keepEmptyRows: true,
  });
  if (rows.length > MAX_ROWS)
    throw new ImportFileError(
      `That file has ${rows.length.toLocaleString("en-IN")} rows. The importer handles ${MAX_ROWS.toLocaleString("en-IN")} at a time — split it by month and run it twice.`,
    );
  return [toSheet(name, rows)];
}

/**
 * One cell of an XLSX, as TEXT — because every downstream reader takes text.
 *
 * ── A DATE CELL IS NOT A STRING, AND ITS `toString()` IS A TRAP ───────────
 *
 * ExcelJS hands a real date cell back as a JS `Date`. Its `toString()` is
 * `"Fri Jun 12 2026 00:00:00 GMT+0530 (India Standard Time)"` — which
 * `coerceDate` cannot read, and which would make every properly-formatted date
 * column in the file fail while the badly-typed text ones passed. It is
 * emitted as ISO instead.
 *
 * ExcelJS also reads dates as UTC midnight, so formatting in local time east
 * of Greenwich gives the day BEFORE. The UTC parts are taken directly.
 */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // A formula cell carries its computed result; a rich-text cell carries
    // runs; a hyperlink carries its text. Take what a person would read.
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
    if ("richText" in o && Array.isArray(o.richText))
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("error" in o) return String(o.error);
    return "";
  }
  return String(v);
}

async function parseWorkbook(buf: ArrayBuffer): Promise<SheetData[]> {
  // Loaded ONLY when an .xlsx is chosen. It is a large library and somebody
  // importing a CSV should never download it.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const all: string[][] = [];
    // `eachRow` without `includeEmpty` SKIPS blank rows and would shift every
    // reported line number — the same trap as the CSV reader's filter. The
    // row's own number is used as the index so the array stays true to the
    // sheet even where ExcelJS declines to visit a row at all.
    const last = ws.rowCount;
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      const width = Math.max(row.cellCount, ws.columnCount);
      for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
      all.push(cells);
    }
    if (all.length > MAX_ROWS)
      throw new ImportFileError(
        `Sheet "${ws.name}" has ${all.length.toLocaleString("en-IN")} rows. The importer handles ${MAX_ROWS.toLocaleString("en-IN")} at a time.`,
      );
    sheets.push(toSheet(ws.name, all));
  });

  // A workbook whose tabs are all empty is a file somebody exported wrong, and
  // saying so beats an empty mapping screen with no explanation.
  if (!sheets.some((s) => s.rows.length))
    throw new ImportFileError(
      "Every sheet in that workbook is empty. Check you exported the tab with the orders on it.",
    );
  return sheets;
}

export async function parseImportFile(file: File): Promise<SheetData[]> {
  const lower = file.name.toLowerCase();

  if (/\.(xlsx|xlsm|xls)$/.test(lower)) {
    // ExcelJS reads .xlsx. A genuine .xls is the old binary format it cannot
    // open, and its failure is an unreadable stack trace — say it plainly.
    if (lower.endsWith(".xls"))
      throw new ImportFileError(
        "That is the old .xls format. Open it and save as .xlsx, or export the sheet as CSV.",
      );
    return parseWorkbook(await file.arrayBuffer());
  }

  const text = await file.text();
  if (!text.trim()) throw new ImportFileError("That file is empty.");
  return parseText(file.name.replace(/\.[^.]+$/, ""), text);
}
