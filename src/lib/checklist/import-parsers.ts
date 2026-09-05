import {
  isFrequency,
  type Frequency,
} from "./frequency";
import {
  normaliseEmail,
  parseDelimited,
  parseImportDate,
  stripHeader,
  type ImportRow,
} from "./import";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What a line of each spreadsheet means
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These run TWICE for every import, and that is the design rather than
 * duplication: once in the browser to draw the preview, and once on the server
 * against freshly-read data before anything is written.
 *
 * They live here, apart from both, so the two runs cannot drift into
 * disagreeing — which is the failure that makes a preview actively harmful. A
 * preview that says "142 will be added" and a server that adds 137 is worse
 * than no preview at all, because the first number is the one somebody
 * remembers.
 *
 * NO SERVER IMPORTS. Everything they need to judge a row — which emails
 * already exist, which dates are taken — is passed in.
 */

// ─── doers ────────────────────────────────────────────────────────────────

export type DoerImport = {
  name: string;
  email: string;
  department: string | null;
  isAdmin: boolean;
};

export const DOER_COLUMNS = ["Name", "Email", "Department", "Role"];

/**
 * `Name, Email, Department, Role`.
 *
 * Role is optional and defaults to an ordinary user. It is read leniently —
 * "admin", "Admin", "ADMINISTRATOR" all mean the same thing — but ONLY those:
 * an unrecognised word gives an ordinary user rather than being refused,
 * because the safe reading of a word nobody understands is the smaller
 * permission, never the larger one.
 */
export function parseDoers(
  text: string,
  existingEmails: Set<string>,
): ImportRow<DoerImport>[] {
  const rows = stripHeader(parseDelimited(text), ["name", "email", "department", "role"]);
  const seen = new Set<string>();

  return rows.map((raw, i) => {
    const line = i + 1;
    const [rawName = "", rawEmail = "", rawDept = "", rawRole = ""] = raw;

    const name = rawName.trim();
    if (!name) return { line, raw, verdict: "error", reason: "No name" };

    const email = normaliseEmail(rawEmail);
    if (!email) {
      return {
        line,
        raw,
        verdict: "error",
        reason: rawEmail.trim() ? "Email does not look right" : "No email",
      };
    }

    if (existingEmails.has(email)) {
      return { line, raw, verdict: "skip", reason: "Already a doer" };
    }
    // A sheet that lists the same person twice would otherwise add one and
    // fail the other on a unique index, mid-import, with no explanation.
    if (seen.has(email)) {
      return { line, raw, verdict: "skip", reason: "Repeated in this paste" };
    }
    seen.add(email);

    const role = rawRole.trim().toLowerCase();
    return {
      line,
      raw,
      verdict: "add",
      value: {
        name,
        email,
        department: rawDept.trim() || null,
        isAdmin: role.startsWith("admin"),
      },
    };
  });
}

// ─── holidays ─────────────────────────────────────────────────────────────

export type HolidayImport = { date: string; name: string | null };

export const HOLIDAY_COLUMNS = ["Date", "Name"];

/**
 * `Date, Name`.
 *
 * A Sunday is ACCEPTED, not refused, and that took a second look. The
 * generator already skips every Sunday, so a Sunday holiday changes nothing —
 * but the real list this is modelled on contains several (Maha Shiv Ratri,
 * Laxmi Pujan), because the list doubles as the company's holiday calendar and
 * people expect to see the festival named on the day it falls. Refusing them
 * would be technically defensible and would break the list somebody actually
 * keeps. The screen says which ones have no effect on the schedule instead.
 */
export function parseHolidays(
  text: string,
  existingDates: Set<string>,
): ImportRow<HolidayImport>[] {
  const rows = stripHeader(parseDelimited(text), ["date", "name", "holiday", "occasion"]);
  const seen = new Set<string>();

  return rows.map((raw, i) => {
    const line = i + 1;
    const [rawDate = "", rawName = ""] = raw;

    const date = parseImportDate(rawDate);
    if (!date) {
      return {
        line,
        raw,
        verdict: "error",
        reason: rawDate.trim() ? "Date not understood" : "No date",
      };
    }
    if (existingDates.has(date)) {
      return { line, raw, verdict: "skip", reason: "Already listed" };
    }
    if (seen.has(date)) {
      return { line, raw, verdict: "skip", reason: "Repeated in this paste" };
    }
    seen.add(date);

    return { line, raw, verdict: "add", value: { date, name: rawName.trim() || null } };
  });
}

// ─── tasks ────────────────────────────────────────────────────────────────

export type TaskImport = {
  name: string;
  doerEmail: string;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  assignedBy: string | null;
};

export const TASK_COLUMNS = ["Task", "Doer email", "Freq", "Start", "End", "Assigned by"];

/**
 * `Task, Doer email, Frequency, Start, End, Assigned by`.
 *
 * The doer must already exist. Creating one on the fly from a task sheet would
 * mean a typo in an email address quietly producing a new person nobody
 * intended, whose work then never appears on anybody's list — a silent,
 * invisible failure, which is exactly the kind this module cannot afford.
 *
 * A repeated `task + doer` is skipped rather than added twice. Their sheets do
 * contain duplicates, and two identical standing duties on one person produce
 * two identical rows to tick every single day.
 */
export function parseTasks(
  text: string,
  doerEmails: Set<string>,
  existingKeys: Set<string>,
  fallbackStart: string,
): ImportRow<TaskImport>[] {
  const rows = stripHeader(parseDelimited(text), [
    "task", "taskname", "doer", "doeremail", "email", "freq", "frequency", "start", "end",
  ]);
  const seen = new Set<string>();

  return rows.map((raw, i) => {
    const line = i + 1;
    const [rawName = "", rawEmail = "", rawFreq = "", rawStart = "", rawEnd = "", rawBy = ""] = raw;

    const name = rawName.trim();
    if (!name) return { line, raw, verdict: "error", reason: "No task name" };
    if (name.length > 300) {
      return { line, raw, verdict: "error", reason: "Task name too long" };
    }

    const email = normaliseEmail(rawEmail);
    if (!email) {
      return {
        line,
        raw,
        verdict: "error",
        reason: rawEmail.trim() ? "Email does not look right" : "No doer email",
      };
    }
    if (!doerEmails.has(email)) {
      return { line, raw, verdict: "error", reason: "Not a doer yet — add them first" };
    }

    const freq = rawFreq.trim().toUpperCase();
    if (!isFrequency(freq)) {
      return {
        line,
        raw,
        verdict: "error",
        reason: freq ? `"${rawFreq.trim()}" is not a frequency` : "No frequency",
      };
    }

    // A blank start means "from the beginning of the financial year", which is
    // what somebody means when they leave it out of a sheet of standing duties.
    const startDate = rawStart.trim() ? parseImportDate(rawStart) : fallbackStart;
    if (!startDate) {
      return { line, raw, verdict: "error", reason: "Start date not understood" };
    }

    let endDate: string | null = null;
    if (rawEnd.trim()) {
      endDate = parseImportDate(rawEnd);
      if (!endDate) {
        return { line, raw, verdict: "error", reason: "End date not understood" };
      }
      if (endDate < startDate) {
        return { line, raw, verdict: "error", reason: "Ends before it starts" };
      }
    }

    const key = `${name.toLowerCase()}|${email}`;
    if (existingKeys.has(key)) {
      return { line, raw, verdict: "skip", reason: "Already assigned to them" };
    }
    if (seen.has(key)) {
      return { line, raw, verdict: "skip", reason: "Repeated in this paste" };
    }
    seen.add(key);

    return {
      line,
      raw,
      verdict: "add",
      value: {
        name,
        doerEmail: email,
        frequency: freq,
        startDate,
        endDate,
        assignedBy: rawBy.trim() || null,
      },
    };
  });
}
