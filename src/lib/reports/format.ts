import type { ColumnType, ReportColumn } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  One set of rules for turning a value into a cell
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NO IMPORTS beyond types, so the CSV writer, the workbook builder and the
 * on-screen preview all reach the same answer. A figure that reads ₹1,23,456
 * in the preview and 123456.00 in the file is fine — those are different jobs.
 * A figure that reads differently in two FILES is a bug nobody catches until
 * two people compare printouts.
 */

/** `₹1,23,456.00` — Indian grouping, for anything a person reads on screen. */
export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "− " : "";
  return (
    sign +
    "₹" +
    Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/**
 * `₹8.47 cr`, `₹13.5 L`, `₹4,200` — for KPI cards, where the exact paise
 * cost more space than they are worth and the magnitude is the message.
 * Crore and lakh, not million, because that is how the figure is spoken here.
 */
export function inrShort(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "− " : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  return `${sign}₹${Math.round(a).toLocaleString("en-IN")}`;
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-IN");
}

export function qty(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function pct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(dp)}%`;
}

/** A signed change, for "August fell 8.2% against July". */
export function delta(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${s}${Math.abs(n).toFixed(dp)}%`;
}

/** `Aug 2026` from `2026-08-01` or `2026-08`. */
export function monthName(key: string): string {
  const [y, m] = key.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

/**
 * ── WHAT GOES INTO A FILE ────────────────────────────────────────────────
 *
 * Deliberately NOT the pretty forms above. A CSV amount is a bare number so
 * the receiving spreadsheet can add it up; a rupee sign and a comma turn the
 * column into text and every SUM in it returns zero. Dates are ISO for the
 * same reason: `05/09/2026` is the fifth of September here and the ninth of
 * May in half the software that will open this file.
 */
export function csvValue(v: unknown, type: ColumnType): string {
  if (v === null || v === undefined) return "";
  switch (type) {
    case "money":
      return Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "";
    case "number":
      return Number.isFinite(Number(v)) ? String(Number(v)) : "";
    case "int":
      return Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : "";
    case "percent":
      return Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "";
    case "boolean":
      return v ? "Yes" : "No";
    case "date":
      return String(v).slice(0, 10);
    case "datetime":
      return isoToKolkata(String(v));
    default:
      return String(v);
  }
}

/**
 * `2026-09-05 14:32` in Bhiwandi's time.
 *
 * The server's clock is UTC on Vercel, so a raw timestamp puts anything after
 * 18:30 IST on the wrong day. Every timestamp any person reads passes through
 * here — the same rule the topbar learned the hard way.
 */
export function isoToKolkata(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

/** The Excel number format for a column type. */
export function excelFormat(type: ColumnType): string | undefined {
  switch (type) {
    case "money":
      return '#,##0.00;[Red]-#,##0.00';
    case "number":
      return "#,##0.00";
    case "int":
      return "#,##0";
    case "percent":
      return '0.0"%"';
    case "date":
      return "yyyy-mm-dd";
    case "datetime":
      return "yyyy-mm-dd hh:mm";
    default:
      return undefined;
  }
}

export function isNumeric(type: ColumnType): boolean {
  return type === "money" || type === "number" || type === "int" || type === "percent";
}

/** A width that fits the data, not just the heading. */
export function excelWidth(col: ReportColumn): number {
  if (col.width) return col.width;
  switch (col.type) {
    case "money": return 15;
    case "number": return 13;
    case "int": return 10;
    case "percent": return 10;
    case "date": return 12;
    case "datetime": return 18;
    case "boolean": return 9;
    default: return Math.max(14, Math.min(38, col.label.length + 4));
  }
}
