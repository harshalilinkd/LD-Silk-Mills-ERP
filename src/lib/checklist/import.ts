/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Getting a list out of a spreadsheet and into the checklist
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The whole module starts empty and has to be filled with a few hundred rows —
 * doers, holidays, and a task list that at Linkd Prints runs past a thousand.
 * Typing those one dialog at a time is not a plan, so every setup screen takes
 * a paste or a file.
 *
 * ── IT ACCEPTS WHAT PEOPLE ACTUALLY PASTE, NOT WHAT CSV SAYS ─────────────
 *
 * Nobody exports a file. They select cells in Excel and press Ctrl+C, and what
 * lands on the clipboard is TAB-separated, not comma-separated. A parser that
 * only understands commas would read a pasted spreadsheet as one long column
 * and reject every row for having too few fields — technically correct, and
 * useless. So the delimiter is detected from the first line, and both are fine.
 *
 * Quoted fields are handled properly because a task name is prose and prose
 * has commas in it: `"Check 10*10 samples, all designers"` is one field, and a
 * naive `split(",")` turns it into two and shifts every column after it.
 *
 * NO IMPORTS. The preview runs in the browser so somebody sees what will
 * happen before it happens; the same functions run on the server to re-check
 * it, because a browser preview is a courtesy and never a validation.
 */

export type Delimiter = "," | "\t";

/**
 * Guess the delimiter from the first non-empty line.
 *
 * Tabs win ties. A line containing both almost always came from a spreadsheet
 * where the tabs are the column breaks and the commas are inside a cell.
 */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

/**
 * A proper delimited-text reader: quoted fields, doubled quotes inside them,
 * newlines inside a quoted field, CRLF, and the byte-order mark Excel puts at
 * the front of every file it saves as CSV.
 */
export function parseDelimited(text: string, delimiter?: Delimiter): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = delimiter ?? detectDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        // A doubled quote is a literal quote; a single one closes the field.
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // Swallowed — the \n that follows ends the row.
    } else {
      field += c;
    }
  }

  // Whatever is still in hand when the text runs out is a final row, unless
  // the file simply ended with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

/**
 * Drop a header row if there is one.
 *
 * Detected rather than assumed, because half the pastes will include the
 * spreadsheet's own header and half will not, and asking somebody to remember
 * which is the kind of instruction that produces a doer called "Name".
 */
export function stripHeader(rows: string[][], headerWords: string[]): string[][] {
  if (rows.length === 0) return rows;
  const first = rows[0].map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
  const wanted = headerWords.map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
  const hits = first.filter((c) => wanted.includes(c)).length;
  return hits >= 1 && hits >= Math.min(2, first.length) ? rows.slice(1) : rows;
}

// ─── dates, in whichever order they were typed ────────────────────────────

/**
 * Read a date from a spreadsheet cell.
 *
 * `26/01/2026` is what India writes and what every screen in this module
 * prints, so a bare `dd/mm/yyyy` is read as day-first — NOT month-first, which
 * is the single most expensive assumption a date parser can make here: it
 * would silently turn the 3rd of March into the 3rd of March and the 1st of
 * May into the 5th of January without ever erroring.
 *
 * `2026-01-26` is also accepted, because that is what a real CSV export gives.
 * Anything ambiguous beyond those two is refused rather than guessed.
 */
export function parseImportDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO first — unambiguous.
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoOrNull(+m[1], +m[2], +m[3]);

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy — day first, see above.
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) return isoOrNull(+m[3], +m[2], +m[1]);

  return null;
}

function isoOrNull(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null; // 31 February and friends
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ─── the shape a preview takes ────────────────────────────────────────────

/**
 * One line of a proposed import, with a verdict attached.
 *
 * `skip` is not `error`, and the difference is the point: a doer who is
 * already in the list is not a mistake somebody has to go and fix, it is a row
 * the import will step over. Bundling the two would make a second paste of the
 * same spreadsheet look like a hundred failures.
 */
export type ImportVerdict = "add" | "skip" | "error";

export type ImportRow<T> = {
  line: number;
  verdict: ImportVerdict;
  /** Why it will be skipped or refused. Empty for `add`. */
  reason?: string;
  /** The parsed value. Present whenever the verdict is `add`. */
  value?: T;
  /** What was on the line, for showing back in the preview. */
  raw: string[];
};

export function countVerdicts<T>(rows: ImportRow<T>[]): Record<ImportVerdict, number> {
  return {
    add: rows.filter((r) => r.verdict === "add").length,
    skip: rows.filter((r) => r.verdict === "skip").length,
    error: rows.filter((r) => r.verdict === "error").length,
  };
}

// ─── email ────────────────────────────────────────────────────────────────

/**
 * Deliberately loose. This is a join key between two lists a human maintains,
 * not an address anything sends to — and a stricter rule mostly rejects real
 * addresses. Lowercased, because that is the only way `Aditya@…` typed into a
 * spreadsheet finds the same person as `aditya@…` typed into the ERP.
 */
export function normaliseEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}
