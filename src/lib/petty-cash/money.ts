/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Rupees, and the words the module uses for them
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NO IMPORTS. The form, the table, the summary and the analysis are all client
 * components and all need these; the server actions need the same validation.
 * One definition, so a figure cannot mean one thing on the dashboard and
 * another on the summary.
 *
 * ── AMOUNTS ARE STRINGS ON THE WIRE ──────────────────────────────────────
 *
 * `numeric(12,2)` comes back from postgres.js as a STRING, and it is kept that
 * way through the query layer. Parsing it into a JavaScript number to carry it
 * to the browser and back is how ₹10,000.10 becomes ₹10,000.099999999999 —
 * the exact reason the column is not floating point. It is parsed once, at the
 * moment something is formatted or summed, and never stored parsed.
 */

/** What Postgres hands back for a `numeric`. */
export type Money = string;

export const CURRENCY = "₹";

/**
 * `₹1,23,456.00` — Indian digit grouping, always two decimals.
 *
 * `en-IN` on purpose: 1,23,456 is how the figure is read here, and the old
 * app's own screens group it that way. Rendered with `.num` at every call site
 * so the digits line up in a column.
 */
export function formatMoney(value: Money | number | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  // A negative net prints `− ₹1,500.00`, never `₹-1,500.00`. `toLocaleString`
  // puts a HYPHEN between the symbol and the digits, which at a glance reads
  // as a dash joining two things rather than as a sign — and it is the one
  // glyph deciding whether a month took money in or paid it out. Same minus
  // (U+2212) and same shape as `formatSigned`, so the two agree.
  const sign = n < 0 ? "− " : "";
  return (
    sign +
    CURRENCY +
    Math.abs(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * The signed form: `− ₹1,250.00` for a debit, `+ ₹10,000.00` for a credit.
 *
 * A MINUS SIGN (U+2212), not a hyphen. At the sizes money is rendered a hyphen
 * reads as a dash between two things rather than as a sign, and this is the
 * one glyph on the screen that decides whether the number went in or out.
 */
export function formatSigned(
  value: Money | number | null | undefined,
  type: TransactionType,
): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${type === "DEBIT" ? "−" : "+"} ${formatMoney(n)}`;
}

/** Null for anything that is not a finite number, so callers can show "—". */
export function toNumber(value: Money | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Sum a column of `numeric` strings without going through floating point twice. */
export function sumMoney(values: (Money | number | null | undefined)[]): number {
  return values.reduce<number>((a, v) => a + (toNumber(v) ?? 0), 0);
}

// ─── the two directions ───────────────────────────────────────────────────

export const TRANSACTION_TYPES = ["DEBIT", "CREDIT"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export function isTransactionType(v: unknown): v is TransactionType {
  return v === "DEBIT" || v === "CREDIT";
}

/**
 * Debit is money OUT, credit is money IN. The old app labels them
 * "Debit (Expense)" and "Credit (Deposit)" and that wording is kept verbatim:
 * everybody using this already reads those two words that way, and "debit"
 * alone is ambiguous to anyone who has met a bank statement.
 */
export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  { label: string; short: string; help: string; text: string; chip: string; dot: string }
> = {
  DEBIT: {
    label: "Debit (Expense)",
    short: "Debit",
    help: "Money paid out of the cash box",
    text: "text-status-red",
    chip: "bg-status-red-dim text-status-red",
    dot: "bg-status-red",
  },
  CREDIT: {
    label: "Credit (Deposit)",
    short: "Credit",
    help: "Money put into the cash box",
    text: "text-status-green",
    chip: "bg-status-green-dim text-status-green",
    dot: "bg-status-green",
  },
};

// ─── what proof was kept ──────────────────────────────────────────────────

export const PROOF_TYPES = ["NONE", "VOUCHER", "BILL", "OTHER"] as const;
export type ProofType = (typeof PROOF_TYPES)[number];

export function isProofType(v: unknown): v is ProofType {
  return typeof v === "string" && (PROOF_TYPES as readonly string[]).includes(v);
}

/**
 * `NONE` is a real answer, not an absence: "no bill was taken for the ₹20 auto
 * fare" is a different fact from "nobody has said". The old app starts from
 * Voucher and Bill and lets anything else be typed, which is preserved as
 * `OTHER` plus a label — so the reporting values stay a closed set of four
 * while the wording stays open.
 */
export const PROOF_TYPE_META: Record<ProofType, { label: string; help: string }> = {
  NONE: { label: "No proof", help: "Nothing was kept for this one" },
  VOUCHER: { label: "Voucher", help: "A signed voucher" },
  BILL: { label: "Bill", help: "A shop bill or invoice" },
  OTHER: { label: "Other", help: "Something else — say what" },
};

/** What the screens print, folding OTHER's own wording back in. */
export function proofLabel(type: ProofType, other: string | null): string {
  return type === "OTHER" ? (other?.trim() || "Other") : PROOF_TYPE_META[type].label;
}

// ─── validation both sides share ──────────────────────────────────────────

export const MAX_AMOUNT = 99_999_999.99; // the column is numeric(12,2)

export type AmountCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * The one place an amount is judged.
 *
 * Returns a STRING on success, normalised to two decimals, because that is
 * what goes into a `numeric` column — handing Postgres a JavaScript number
 * would reintroduce the binary-float rounding the column type exists to avoid.
 *
 * Commas and a rupee sign are stripped rather than rejected: people paste
 * "₹1,250" out of WhatsApp, and refusing that teaches them to distrust the
 * form rather than teaching them anything useful.
 */
export function checkAmount(raw: string | number | null | undefined): AmountCheck {
  if (raw === null || raw === undefined) return { ok: false, error: "Enter an amount." };
  const cleaned = String(raw).replace(/[₹,\s]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter an amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Enter an amount like 1250 or 1250.50." };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "The amount has to be more than zero." };
  }
  if (n > MAX_AMOUNT) return { ok: false, error: "That amount is too large." };
  return { ok: true, value: n.toFixed(2) };
}

// ─── attachments ──────────────────────────────────────────────────────────

export const ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_HELP = "A photo (JPG, PNG, WEBP, HEIC) or a PDF, up to 10 MB.";
