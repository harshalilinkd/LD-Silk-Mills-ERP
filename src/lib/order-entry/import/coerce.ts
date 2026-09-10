// Reading a cell that nobody validated when it was typed.
//
// Every function here returns either a value AND a note saying what it did, or
// a refusal AND the reason. Nothing is cleaned quietly — see `types.ts`.

import type { Coerced } from "./types";

// ─── text ─────────────────────────────────────────────────────────────────

/**
 * Zero-width and non-breaking characters.
 *
 * These are invisible and they are everywhere in spreadsheet data: a
 * non-breaking space arrives from a web page somebody pasted from, and a
 * zero-width space from a formula. `"PR EXPO"` with a trailing U+00A0 is a
 * DIFFERENT party from `"PR EXPO"` to every comparison in this system, and
 * nothing on any screen shows why.
 */
const INVISIBLE = /[​-‍﻿   ]/g;

export function coerceText(raw: string, max?: number): Coerced<string> {
  const had = INVISIBLE.test(raw);
  INVISIBLE.lastIndex = 0;

  // Collapse runs of whitespace too: "A  and   M" and "A and M" are one party
  // and the sheet has both.
  const cleaned = raw.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();

  if (!cleaned) return { ok: true, value: null };

  // ── A DASH IS HOW A SPREADSHEET WRITES "NOTHING" ────────────────────────
  //
  // `SALES PERSON` in the old sheet is `-` on thousands of rows, and so are
  // AGENT and TRANSPORT. Stored literally it becomes a party/salesperson
  // actually NAMED "-": it lands in the masters list, in every dropdown, and
  // in the "new names found" tick-box asking whether to create it. Read as
  // blank, which is what the person typing it meant.
  if (/^[-–—.]+$/.test(cleaned)) {
    return { ok: true, value: null, note: `"${cleaned}" read as blank` };
  }

  if (max && cleaned.length > max) {
    return {
      ok: false,
      reason: `${cleaned.length} characters, and the column holds ${max}`,
    };
  }

  const notes: string[] = [];
  if (had) notes.push("removed invisible characters");
  if (cleaned !== raw.trim() && !had) notes.push("collapsed extra spaces");

  return {
    ok: true,
    value: cleaned,
    note: notes.length ? notes.join("; ") : undefined,
  };
}

// ─── dates ────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null; // 31 February and friends
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Two digits into a year. 26 is 2026; 98 is 1998. */
function fullYear(y: number): number {
  if (y >= 100) return y;
  return y <= 70 ? 2000 + y : 1900 + y;
}

/**
 * A date, read the way an Indian spreadsheet writes them.
 *
 * ── DAY FIRST, AND IT IS FLAGGED WHEN IT MATTERS ──────────────────────────
 *
 * `05/06/2026` is 5 June here and 6 May in a US export, and NOTHING in the
 * cell says which. Day-first is the house rule (the checklist importer, the
 * whole ERP), so that is what it reads — but when both halves are 12 or under
 * the value is genuinely ambiguous and it says so in a note. Over half a
 * financial year those notes are the list somebody should spot-check.
 *
 * Excel/Sheets serial numbers are also accepted: a column formatted as a date
 * and exported to CSV sometimes arrives as `46543`. Day 1 is 1900-01-01 and
 * the sheet believes 1900 was a leap year, which is why 1899-12-30 is the
 * epoch used here — the bug is load-bearing and copying it is correct.
 */
export function coerceDate(raw: string): Coerced<string> {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };

  // Already a real date object stringified by the XLSX reader.
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) {
    const v = iso(+m[1], +m[2], +m[3]);
    return v
      ? { ok: true, value: v }
      : { ok: false, reason: `"${s}" is not a real date` };
  }

  // dd-MMM-yyyy / 12 June 2026 / Jun 12, 2026
  m = /^(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})[\s\-/.,]*(\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mo) {
      const v = iso(fullYear(+m[3]), mo, +m[1]);
      if (v) return { ok: true, value: v };
    }
  }
  m = /^([A-Za-z]{3,9})[\s\-/.]*(\d{1,2})[\s\-/.,]*(\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mo) {
      const v = iso(fullYear(+m[3]), mo, +m[2]);
      if (v) return { ok: true, value: v };
    }
  }

  // dd/mm/yyyy, dd-mm-yy, d.m.yyyy — day first.
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    const y = fullYear(+m[3]);
    const v = iso(y, mo, d);
    if (v) {
      const ambiguous = d <= 12 && mo <= 12 && d !== mo;
      return {
        ok: true,
        value: v,
        note: ambiguous
          ? `read "${s}" as ${d} of month ${mo} — day-first; check if the sheet meant month-first`
          : undefined,
      };
    }
    // Day and month the wrong way round is the single most common slip, and
    // saying so is more useful than "not a real date".
    if (iso(y, d, mo)) {
      return {
        ok: false,
        reason: `"${s}" has no day ${d} in month ${mo} — month-first would work, so this row is probably mm/dd`,
      };
    }
    return { ok: false, reason: `"${s}" is not a real date` };
  }

  // A spreadsheet serial number.
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n >= 20000 && n <= 80000) {
      const ms = Date.UTC(1899, 11, 30) + n * 86400000;
      const d = new Date(ms);
      const v = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      if (v)
        return {
          ok: true,
          value: v,
          note: `"${s}" was a spreadsheet date serial — read as ${v}`,
        };
    }
  }

  return { ok: false, reason: `"${s}" is not a date this can read` };
}

// ─── numbers ──────────────────────────────────────────────────────────────

/**
 * A quantity, a rate or an amount.
 *
 * Strips what a person types around a number and a spreadsheet leaves in it:
 * the rupee sign, Indian digit grouping, a unit written into the cell
 * (`1200 mtr`), and accountancy brackets for a negative. Anything left over
 * that is not part of a number is a refusal, not a guess — `12-15` is a RANGE
 * somebody typed and reading it as 12 would be inventing a figure.
 */
export function coerceNumber(raw: string): Coerced<number> {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };

  const notes: string[] = [];
  let t = s.replace(INVISIBLE, "");

  const bracketed = /^\((.*)\)$/.exec(t);
  if (bracketed) {
    t = "-" + bracketed[1];
    notes.push("brackets read as a negative");
  }

  if (/[₹Rs]/i.test(t)) notes.push("removed the currency symbol");
  t = t.replace(/₹/g, "").replace(/\brs\.?/gi, "");

  // A unit written into the cell. Captured before the digit strip so the note
  // can say what was dropped.
  const unit = /([a-z]+)\s*$/i.exec(t.replace(/\s+/g, " ").trim());
  if (unit && !/^e\d+$/i.test(unit[1])) {
    notes.push(`ignored "${unit[1]}" after the number`);
    t = t.slice(0, t.lastIndexOf(unit[1]));
  }

  if (/,/.test(t)) notes.push("removed digit grouping");
  t = t.replace(/,/g, "").replace(/\s/g, "");

  if (!t || !/^-?\d*\.?\d+$/.test(t)) {
    return { ok: false, reason: `"${s}" is not a number` };
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, reason: `"${s}" is not a number` };

  return {
    ok: true,
    value: n,
    note: notes.length ? notes.join("; ") : undefined,
  };
}

// ─── flags ────────────────────────────────────────────────────────────────

// ── "OK" MEANS THE ORDER IS FINE, NOT THAT IT IS CANCELLED ────────────────
//
// The only flag column this importer has is `is_cancelled`, so this vocabulary
// is read as answers to "was this line cancelled?" and nothing else.
//
// The old sheet's `cancelled order` column is filled with exactly two words:
// `OK` for a live line and `Cancelled` for a dead one. `ok` sat in TRUE_WORDS
// here — a leftover from reading this as a generic done/not-done column — which
// made every healthy line in half a financial year import as CANCELLED. It is a
// silent inversion: no error, no warning, and the orders all look real until
// somebody asks why the year has no sales.
//
// `done` is in NEITHER list on purpose. In a cancellation column it is a
// genuinely ambiguous word — "done" could be the work finishing or the
// cancelling finishing — and a refusal somebody reads beats a guess nobody sees.
const TRUE_WORDS = new Set([
  "y", "yes", "true", "1", "cancel", "cancelled", "canceled", "cancel order",
  "cancelled order", "x", "✓", "✔",
]);
const FALSE_WORDS = new Set([
  "n", "no", "false", "0", "-", "--", "", "pending", "open",
  "ok", "okay", "live", "active", "fine", "good", "valid",
]);

/**
 * A yes/no column, as ticked by six different people over six months.
 *
 * An unrecognised word is NOT silently false. A cancellation flag that reads a
 * word it does not know as "not cancelled" imports a cancelled order as live,
 * which is money in a total that should not be there.
 */
export function coerceFlag(raw: string): Coerced<boolean> {
  const s = raw.trim().toLowerCase();
  if (!s) return { ok: true, value: null };
  if (TRUE_WORDS.has(s)) return { ok: true, value: true };
  if (FALSE_WORDS.has(s)) return { ok: true, value: false };
  return { ok: false, reason: `"${raw.trim()}" is not a yes or a no` };
}

// ─── matching a name against a list ───────────────────────────────────────

/** The form a name is COMPARED in. Never the form it is stored in. */
export function normaliseName(s: string): string {
  return s
    .replace(INVISIBLE, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The closest existing master value, or nothing.
 *
 * Deliberately conservative: it only offers a suggestion when the normalised
 * forms match exactly, or one contains the other and the shorter is at least
 * five characters. A fuzzy edit-distance match would confidently propose
 * "LONDON" for "LONDAN" and also "EARTH" for "EARTHY", and an import that
 * quietly merges two fabrics is not recoverable by looking at the result.
 */
export function nearestName(
  value: string,
  known: Map<string, string>,
): string | undefined {
  const n = normaliseName(value);
  if (!n) return undefined;
  const exact = known.get(n);
  if (exact) return exact;
  if (n.length < 5) return undefined;
  for (const [k, original] of known) {
    if (k.length < 5) continue;
    if (k.includes(n) || n.includes(k)) return original;
  }
  return undefined;
}
