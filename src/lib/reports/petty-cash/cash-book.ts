import "server-only";

import { sql as pg } from "@/db";
import { matrixFrom, rank, spread, trend, trendInsight } from "../analysis";
import { count, inr, inrShort, pct, plural } from "../format";
import { money2, n } from "../num";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";

/**
 * Petty cash book — one row per entry, in and out.
 *
 * ── ONE REPORT, AND IT IS THE LEDGER ─────────────────────────────────────
 *
 * Petty Cash has four tables and one of them holds money. A monthly-summary
 * report and a category-breakdown report would both be roll-ups of this same
 * sheet — the thing the owner had cut out of Orders — and the module's own
 * Monthly summary screen already does that roll-up live. So this is the export
 * of the ledger, with the roll-ups on its dashboard where they belong.
 *
 * ── EVERY FIGURE MATCHES THE LEDGER SCREEN, BY CONSTRUCTION ──────────────
 *
 * `LIVE` here is the same `deleted_at is null` the module's own queries use.
 * A soft-deleted entry is EXCLUDED from every figure and is not a row in this
 * file: the ledger screen does not show it, so an export that did would make
 * the two disagree, and "the balance in the file is ₹5,000 more than on the
 * screen" is the fastest way to lose trust in both.
 *
 * ── THE SNAPSHOT NAMES ARE PRINTED, NOT THE CURRENT ONES ─────────────────
 *
 * `to_name` and `category_name` were written at the moment of entry and no
 * rename ever rewrites them. A voucher printed in April said "Ramesh
 * (canteen)"; correcting the spelling in September must not make the April
 * voucher claim otherwise. The CURRENT category is carried beside the snapshot
 * so a re-grouped category can still be rolled up where it now belongs.
 */
const SQL = `
  select
    t.uid,
    t.transaction_date,
    t.transaction_type::text as kind,
    t.from_name,
    t.to_name,
    e.name              as employee,
    t.category_name     as category_snapshot,
    c.name              as category_now,
    c.group_name        as category_group,
    t.reason,
    t.amount,
    t.proof_type::text  as proof_type,
    t.proof_other,
    (t.attachment_path is not null and t.attachment_path <> '') as has_receipt,
    t.attachment_name,
    t.created_at
  from ld_petty_cash.transactions t
  left join ld_petty_cash.categories c on c.id = t.category_id
  left join ld_petty_cash.employees  e on e.id = t.employee_id
  where t.deleted_at is null
    and ($1::date is null or t.transaction_date >= $1::date)
    and ($2::date is null or t.transaction_date <= $2::date)
    and ($3::text is null or t.category_name = $3::text)
    and ($4::text is null or t.transaction_type::text = $4::text)
  -- Newest first, then the reference — the reference is unique, so two runs of
  -- the same period produce the same file.
  order by t.transaction_date desc, t.uid desc
`;

type Raw = {
  uid: string; transaction_date: string; kind: string; from_name: string | null;
  to_name: string | null; employee: string | null; category_snapshot: string | null;
  category_now: string | null; category_group: string | null; reason: string | null;
  amount: string; proof_type: string | null; proof_other: string | null;
  has_receipt: boolean; attachment_name: string | null; created_at: string;
};

const PROOF: Record<string, string> = {
  VOUCHER: "Voucher",
  BILL: "Bill",
  RECEIPT: "Receipt",
  NONE: "No proof kept",
  OTHER: "Other",
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [
    params.from ?? null,
    params.to ?? null,
    params.category ?? null,
    params.kind ?? null,
  ])) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
    uid: r.uid,
    transaction_date: r.transaction_date?.slice(0, 10) ?? null,
    kind: r.kind === "CREDIT" ? "Money in" : "Money out",
    from_name: r.from_name,
    to_name: r.to_name,
    employee: r.employee,
    category: r.category_snapshot,
    category_now: r.category_now,
    category_group: r.category_group,
    renamed_since:
      !!r.category_snapshot && !!r.category_now && r.category_snapshot !== r.category_now,
    reason: r.reason,
    // In and out as separate columns, the way a cash book is written. One
    // signed column would need every reader to remember which sign is which.
    money_in: r.kind === "CREDIT" ? money2(r.amount) : null,
    money_out: r.kind === "DEBIT" ? money2(r.amount) : null,
    amount: money2(r.amount),
    proof_type: r.proof_type ? (PROOF[r.proof_type] ?? r.proof_type) : null,
    proof_other: r.proof_other,
    has_receipt: r.has_receipt,
    attachment_name: r.attachment_name,
    created_at: r.created_at,
  }));

  // ── the figures ─────────────────────────────────────────────────────────
  const credits = raw.filter((r) => r.kind === "CREDIT");
  const debits = raw.filter((r) => r.kind === "DEBIT");
  const inTotal = credits.reduce((s, r) => s + n(r.amount), 0);
  const outTotal = debits.reduce((s, r) => s + n(r.amount), 0);
  const sizes = spread(debits.map((r) => n(r.amount)));
  const noProof = raw.filter((r) => !r.proof_type || r.proof_type === "NONE").length;
  const noReceipt = raw.filter((r) => !r.has_receipt).length;

  const byMonth = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byGroup = new Map<string, number>();
  const byPayee = new Map<string, number>();
  for (const r of debits) {
    const m = r.transaction_date?.slice(0, 7);
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + n(r.amount));
    byCategory.set(r.category_snapshot?.trim() || "Not recorded", (byCategory.get(r.category_snapshot?.trim() || "Not recorded") ?? 0) + n(r.amount));
    byGroup.set(r.category_group?.trim() || "Not grouped", (byGroup.get(r.category_group?.trim() || "Not grouped") ?? 0) + n(r.amount));
    byPayee.set(r.to_name?.trim() || "Not recorded", (byPayee.get(r.to_name?.trim() || "Not recorded") ?? 0) + n(r.amount));
  }

  const t = trend(byMonth, inrShort);
  const insights: string[] = [];
  const ti = trendInsight(t, "spending");
  if (ti) insights.push(ti);
  if (raw.length) {
    insights.push(
      `${inrShort(inTotal)} came in and ${inrShort(outTotal)} went out across ${plural(raw.length, "entry", "entries")}, leaving ${inrShort(inTotal - outTotal)} for this period.`,
    );
  }
  if (byCategory.size) {
    const top = [...byCategory].sort((a, b) => b[1] - a[1])[0];
    insights.push(
      `${top[0]} is the biggest category — ${inrShort(top[1])}, ${pct(outTotal > 0 ? (top[1] / outTotal) * 100 : 0, 0)} of everything paid out.`,
    );
  }
  if (sizes.n > 0 && sizes.median !== null) {
    insights.push(
      `The middle payment is ${inr(sizes.median)}; the largest is ${inr(sizes.max ?? 0)}.` +
        (sizes.outlierHigh !== null
          ? ` Anything over ${inr(sizes.outlierHigh)} is unusually large for this box.`
          : ""),
    );
  }
  if (noProof) {
    insights.push(
      `${count(noProof)} of ${count(raw.length)} entries have no proof recorded against them.`,
    );
  }
  if (raw.length > 0 && raw.length < 20) {
    insights.push(
      `Only ${plural(raw.length, "entry", "entries")} on record. The figures above are true but thin — this report becomes useful once the box is being used day to day.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${inrShort(outTotal)} paid out and ${inrShort(inTotal)} put in over ${plural(raw.length, "entry", "entries")}.`
        : "No petty cash entries in this period.",
      kpis: [
        { label: "Entries", value: count(raw.length) },
        { label: "Money in", value: inrShort(inTotal), tone: "good", sub: plural(credits.length, "entry", "entries") },
        { label: "Money out", value: inrShort(outTotal), tone: "bad", sub: plural(debits.length, "entry", "entries") },
        { label: "Net for the period", value: inrShort(inTotal - outTotal), tone: inTotal - outTotal < 0 ? "bad" : "good" },
        { label: "Middle payment", value: sizes.median !== null ? inr(sizes.median) : "—", sub: "half are bigger, half smaller" },
        { label: "Largest payment", value: sizes.max !== null ? inr(sizes.max) : "—" },
        { label: "No proof recorded", value: count(noProof), tone: noProof ? "warn" : "good", lowerIsBetter: true },
        { label: "No receipt attached", value: count(noReceipt), tone: noReceipt ? "warn" : "good", lowerIsBetter: true },
      ],
      trend: t.points.length > 1
        ? { title: "What went out each month", valueLabel: "Paid out", points: t.points, averageLabel: "Average month in this period" }
        : undefined,
      panels: [
        { title: "What the money went on", valueLabel: "Paid out", rows: rank([...byCategory].map(([label, value]) => ({ label, value })), inrShort) },
        {
          title: "Which group it belongs to",
          valueLabel: "Paid out",
          kind: "share",
          rows: rank([...byGroup].map(([label, value]) => ({ label, value })), inrShort, 6),
          note: "Categories rolled up the way the monthly summary rolls them up.",
        },
        { title: "Who was paid the most", valueLabel: "Paid out", rows: rank([...byPayee].map(([label, value]) => ({ label, value })), inrShort) },
      ],
      matrix: matrixFrom(
        debits.map((r) => ({
          label: r.category_snapshot?.trim() || "Not recorded",
          month: r.transaction_date?.slice(0, 7) ?? "",
          value: n(r.amount),
        })),
        { title: "What was spent on what, and when", format: "money", display: inrShort },
      ),
      insights,
      caveats: [
        "Deleted entries are excluded entirely — the same rule the ledger screen follows, so the two always agree. A petty cash entry is never destroyed: it is marked deleted with a reason and kept, and the audit log records who did it.",
        "The payee and category printed here are SNAPSHOTS, written when the entry was made. Renaming a payee or a category afterwards does not rewrite them, which is correct — an April voucher said what it said. The current category name is carried beside the snapshot.",
        "The balance shown is of THIS PERIOD, not the balance in the box. The box's running balance is on the Ledger screen and never moves when a filter changes.",
      ],
    },
  };
}

export const cashBook: ReportDefinition = {
  id: "petty-cash.cash-book",
  module: "petty-cash",
  title: "Petty cash book",
  description:
    "Every entry in and out — date, reference, who paid whom, what for, which category, what proof was kept and whether a receipt is attached.",
  defaultMonthsBack: 6,
  columns: [
    { key: "uid", label: "Reference", type: "text", width: 16 },
    { key: "transaction_date", label: "Date", type: "date", note: "The day it happened, as written down — not the day it was typed in." },
    { key: "kind", label: "Type", type: "text", width: 12 },
    { key: "from_name", label: "From", type: "text", width: 22 },
    { key: "to_name", label: "To", type: "text", width: 24 },
    { key: "employee", label: "Employee", type: "text", width: 22, optional: true },
    { key: "category", label: "Category", type: "text", width: 22, note: "As written at the time." },
    { key: "category_now", label: "Category now", type: "text", width: 22, optional: true },
    { key: "category_group", label: "Group", type: "text", width: 20 },
    { key: "renamed_since", label: "Renamed since", type: "boolean", note: "The category has been renamed since this entry was made. Both names are carried." },
    { key: "reason", label: "What for", type: "text", width: 36 },
    { key: "money_in", label: "Money in", type: "money" },
    { key: "money_out", label: "Money out", type: "money" },
    { key: "amount", label: "Amount", type: "money", total: "none", note: "The same figure as the in or out column beside it, whichever applies. NOT totalled — adding it up mixes money in with money out." },
    { key: "proof_type", label: "Proof", type: "text", width: 16, note: "What KIND of slip was kept. Separate from whether a photo is attached." },
    { key: "proof_other", label: "Proof, in their words", type: "text", width: 22, optional: true },
    { key: "has_receipt", label: "Receipt attached", type: "boolean" },
    { key: "attachment_name", label: "Receipt file", type: "text", width: 26, optional: true },
    { key: "created_at", label: "Entered at", type: "datetime" },
  ],
  filters: [
    { key: "dateRange", label: "Date", kind: "dateRange" },
    {
      key: "category",
      label: "Category",
      kind: "select",
      options: async () => {
        const rows = await pg.unsafe(
          `select distinct category_name as v from ld_petty_cash.transactions
            where deleted_at is null and category_name is not null order by 1`,
        );
        return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
      },
    },
    {
      key: "kind",
      label: "Type",
      kind: "select",
      options: async () => [
        { value: "CREDIT", label: "Money in" },
        { value: "DEBIT", label: "Money out" },
      ],
    },
  ],
  run,
};
