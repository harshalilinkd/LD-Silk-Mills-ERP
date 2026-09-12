import "server-only";

import { sql as pg } from "@/db";
import { fetchAttachmentBytes } from "@/lib/petty-cash/attachments";
import {
  fillMonths,
  matrixFrom,
  rank,
  spread,
  trend,
  trendInsight,
} from "../analysis";
import { count, inr, inrShort, pct, plural } from "../format";
import { money2, n } from "../num";
import type {
  ReportDefinition,
  ReportImageRef,
  ReportImages,
  ReportParams,
  ReportResult,
  ReportRow,
} from "../types";
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
    (
      select count(*)::int from ld_petty_cash.entry_attachments ea where ea.transaction_id = t.id
    ) + (case when t.attachment_path is not null and t.attachment_path <> '' then 1 else 0 end)
      as receipt_count,
    coalesce(
      (
        select string_agg(ea.file_name, '; ' order by ea.id)
        from ld_petty_cash.entry_attachments ea where ea.transaction_id = t.id
      ),
      t.attachment_name
    ) as receipt_files,
    -- The storage paths, for the Receipts sheet. They are NEVER printed: the
    -- workbook draws the picture and throws the path away. A path in a file is
    -- a path somebody tries, and this bucket answers to nothing but the proxy
    -- route with its own permission check.
    coalesce(
      (
        select json_agg(
                 json_build_object('name', ea.file_name, 'ref', ea.file_path, 'mime', ea.mime_type)
                 order by ea.id
               )
        from ld_petty_cash.entry_attachments ea where ea.transaction_id = t.id
      ),
      '[]'::json
    ) as receipt_list,
    t.attachment_path as legacy_path,
    t.attachment_name as legacy_name,
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
  uid: string;
  transaction_date: string;
  kind: string;
  from_name: string | null;
  to_name: string | null;
  employee: string | null;
  category_snapshot: string | null;
  category_now: string | null;
  category_group: string | null;
  reason: string | null;
  amount: string;
  proof_type: string | null;
  proof_other: string | null;
  receipt_count: number;
  receipt_files: string | null;
  receipt_list: { name: string; ref: string; mime: string | null }[] | null;
  legacy_path: string | null;
  legacy_name: string | null;
  created_at: string;
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
      !!r.category_snapshot &&
      !!r.category_now &&
      r.category_snapshot !== r.category_now,
    reason: r.reason,
    // In and out as separate columns, the way a cash book is written. One
    // signed column would need every reader to remember which sign is which.
    money_in: r.kind === "CREDIT" ? money2(r.amount) : null,
    money_out: r.kind === "DEBIT" ? money2(r.amount) : null,
    amount: money2(r.amount),
    proof_type: r.proof_type ? (PROOF[r.proof_type] ?? r.proof_type) : null,
    proof_other: r.proof_other,
    has_receipt: r.receipt_count > 0,
    receipt_count: r.receipt_count,
    receipt_files: r.receipt_files,
    created_at: r.created_at,
  }));

  // ── THE RECEIPTS THEMSELVES ─────────────────────────────────────────
  //
  // Names and paths only, straight out of the query above — no bytes. The
  // workbook builder calls `load` for the ones it draws, so a CSV export and a
  // dashboard run never touch storage, and a five-thousand-entry period does
  // not pull five thousand photographs to print a table.
  //
  // An entry saved before `entry_attachments` existed carries its one file on
  // the transaction row itself. Both shapes are the same thing to a reader, so
  // they arrive in one list.
  const byRow: Record<string, ReportImageRef[]> = {};
  for (const r of raw.slice(0, MAX_EXPORT_ROWS)) {
    const files: ReportImageRef[] = (r.receipt_list ?? []).map((f) => ({
      name: f.name,
      ref: f.ref,
      mime: f.mime,
    }));
    if (r.legacy_path) {
      files.push({
        name: r.legacy_name ?? "receipt",
        ref: r.legacy_path,
        mime: null,
      });
    }
    if (files.length) byRow[r.uid] = files;
  }

  const images: ReportImages | undefined = Object.keys(byRow).length
    ? {
        rowKey: "uid",
        // What a person needs beside a bill to know which payment it proves.
        columns: ["uid", "transaction_date", "to_name", "amount", "reason"],
        byRow,
        load: async (ref) => {
          const got = await fetchAttachmentBytes(ref);
          if (!got?.body) return null;
          return Buffer.from(await new Response(got.body).arrayBuffer());
        },
      }
    : undefined;

  // ── the figures ────────────────────────────────────────────────────────────
  const credits = raw.filter((r) => r.kind === "CREDIT");
  const debits = raw.filter((r) => r.kind === "DEBIT");
  const inTotal = credits.reduce((s, r) => s + n(r.amount), 0);
  const outTotal = debits.reduce((s, r) => s + n(r.amount), 0);
  const sizes = spread(debits.map((r) => n(r.amount)));
  const noProof = raw.filter(
    (r) => !r.proof_type || r.proof_type === "NONE",
  ).length;
  const noReceipt = raw.filter((r) => r.receipt_count === 0).length;

  const byMonth = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byGroup = new Map<string, number>();
  const byPayee = new Map<string, number>();
  for (const r of debits) {
    const m = r.transaction_date?.slice(0, 7);
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + n(r.amount));
    byCategory.set(
      r.category_snapshot?.trim() || "Not recorded",
      (byCategory.get(r.category_snapshot?.trim() || "Not recorded") ?? 0) +
        n(r.amount),
    );
    byGroup.set(
      r.category_group?.trim() || "Not grouped",
      (byGroup.get(r.category_group?.trim() || "Not grouped") ?? 0) +
        n(r.amount),
    );
    byPayee.set(
      r.to_name?.trim() || "Not recorded",
      (byPayee.get(r.to_name?.trim() || "Not recorded") ?? 0) + n(r.amount),
    );
  }

  // Filled across the period, so six months with one payment in them draw a
  // line that says exactly that, instead of a single point that draws nothing.
  const t = trend(fillMonths(byMonth, params), inrShort);
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
    images,
    analysis: {
      headline: raw.length
        ? `${inrShort(outTotal)} paid out and ${inrShort(inTotal)} put in over ${plural(raw.length, "entry", "entries")}.`
        : "No petty cash entries in this period.",
      kpis: [
        { label: "Entries", value: count(raw.length) },
        {
          label: "Money in",
          value: inrShort(inTotal),
          tone: "good",
          sub: plural(credits.length, "entry", "entries"),
        },
        {
          label: "Money out",
          value: inrShort(outTotal),
          tone: "bad",
          sub: plural(debits.length, "entry", "entries"),
        },
        {
          label: "Net for the period",
          value: inrShort(inTotal - outTotal),
          tone: inTotal - outTotal < 0 ? "bad" : "good",
        },
        {
          label: "Middle payment",
          value: sizes.median !== null ? inr(sizes.median) : "—",
          sub: "half are bigger, half smaller",
        },
        {
          label: "Largest payment",
          value: sizes.max !== null ? inr(sizes.max) : "—",
        },
        {
          label: "No proof recorded",
          value: count(noProof),
          tone: noProof ? "warn" : "good",
          lowerIsBetter: true,
        },
        {
          label: "No receipt attached",
          value: count(noReceipt),
          tone: noReceipt ? "warn" : "good",
          lowerIsBetter: true,
        },
      ],
      trend:
        t.points.length > 1
          ? {
              title: "What went out each month",
              valueLabel: "Paid out",
              points: t.points,
              averageLabel: "Average month in this period",
            }
          : undefined,
      panels: [
        // ── ALWAYS TWO BARS, WHATEVER THE ROW COUNT ────────────────────
        //
        // Every other panel here is a "top N", which collapses to one bar —
        // and therefore to a card — the moment there is one entry. This one
        // cannot: money in and money out are two sides of the same box and
        // both exist even when one of them is zero. It is also the first
        // thing anybody asks of a cash box.
        {
          title: "Money in against money out",
          fixedCategories: true,
          valueLabel: "Rupees",
          // The same two colours the KPI band gives these two figures, so the
          // chart and the tiles above it cannot disagree about which is which.
          rows: [
            {
              label: "Money in",
              value: inTotal,
              display: inrShort(inTotal),
              tone: "good",
            },
            {
              label: "Money out",
              value: outTotal,
              display: inrShort(outTotal),
              tone: "bad",
            },
          ],
          note: "The difference between these two is the net for the period, not the balance in the box.",
        },
        // The third question anybody asks of a cash box, after how much and
        // on what: can we prove it. Both sides always exist, so it draws.
        {
          title: "How well the paperwork is kept",
          fixedCategories: true,
          valueLabel: "Entries",
          // Green, amber, red — the paperwork getting worse down the list. A
          // missing receipt is a chase; a missing PROOF is an entry nobody can
          // substantiate at all, which is the one an auditor stops on.
          rows: [
            {
              label: "Receipt attached",
              value: raw.length - noReceipt,
              display: count(raw.length - noReceipt),
              tone: "good",
            },
            {
              label: "No receipt",
              value: noReceipt,
              display: count(noReceipt),
              tone: "warn",
            },
            {
              label: "No proof recorded",
              value: noProof,
              display: count(noProof),
              tone: "bad",
            },
          ],
          note: "A receipt is the scanned bill; proof is what kind of slip was kept. An entry can have one without the other.",
        },
        {
          title: "What the money went on",
          valueLabel: "Paid out",
          rows: rank(
            [...byCategory].map(([label, value]) => ({ label, value })),
            inrShort,
          ),
        },
        {
          title: "Which group it belongs to",
          valueLabel: "Paid out",
          kind: "share",
          rows: rank(
            [...byGroup].map(([label, value]) => ({ label, value })),
            inrShort,
            6,
          ),
          note: "Categories rolled up the way the monthly summary rolls them up.",
        },
        {
          title: "Who was paid the most",
          valueLabel: "Paid out",
          rows: rank(
            [...byPayee].map(([label, value]) => ({ label, value })),
            inrShort,
          ),
        },
      ],
      matrix: matrixFrom(
        debits.map((r) => ({
          label: r.category_snapshot?.trim() || "Not recorded",
          month: r.transaction_date?.slice(0, 7) ?? "",
          value: n(r.amount),
        })),
        {
          title: "What was spent on what, and when",
          format: "money",
          display: inrShort,
        },
      ),
      insights,
      caveats: [
        "Deleted entries are excluded entirely — the same rule the ledger screen follows, so the two always agree. A petty cash entry is never destroyed: it is marked deleted with a reason and kept, and the audit log records who did it.",
        "The payee and category printed here are SNAPSHOTS, written when the entry was made. Renaming a payee or a category afterwards does not rewrite them, which is correct — an April voucher said what it said. The current category name is carried beside the snapshot.",
        "The balance shown is of THIS PERIOD, not the balance in the box. The box's running balance is on the Ledger screen and never moves when a filter changes.",
      ],
      // A real Excel PivotTable + Slicers — money in and money out per
      // category, side by side, filterable by type, group, payee and proof.
      // `amount` is deliberately NOT a data field: it carries both
      // directions in one column, so summing it nets a payment against a
      // receipt and the answer means nothing (it is `total: "none"` on the
      // Data sheet for exactly that reason).
      pivots: {
        tables: [
          {
            rowFields: ["category"],
            dataFields: [
              { field: "money_out", label: "Sum of money out" },
              { field: "money_in", label: "Sum of money in" },
            ],
            slicerFields: ["kind", "category_group", "to_name", "proof_type"],
            sheetName: "Pivot",
            pivotTableName: "CashPivot",
          },
        ],
      },
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
    {
      key: "transaction_date",
      label: "Date",
      type: "date",
      note: "The day it happened, as written down — not the day it was typed in.",
    },
    { key: "kind", label: "Type", type: "text", width: 12 },
    { key: "from_name", label: "From", type: "text", width: 22 },
    { key: "to_name", label: "To", type: "text", width: 24 },
    {
      key: "employee",
      label: "Employee",
      type: "text",
      width: 22,
      optional: true,
    },
    {
      key: "category",
      label: "Category",
      type: "text",
      width: 22,
      note: "As written at the time.",
    },
    {
      key: "category_now",
      label: "Category now",
      type: "text",
      width: 22,
      optional: true,
    },
    { key: "category_group", label: "Group", type: "text", width: 20 },
    {
      key: "renamed_since",
      label: "Renamed since",
      type: "boolean",
      // Not a fault - the snapshot is deliberately kept - but it tells a reader
      // which rows the two category columns disagree on, and why.
      badge: { Yes: "warn" },
      note: "The category has been renamed since this entry was made. Both names are carried.",
    },
    { key: "reason", label: "What for", type: "text", width: 36 },
    { key: "money_in", label: "Money in", type: "money" },
    { key: "money_out", label: "Money out", type: "money" },
    {
      key: "amount",
      label: "Amount",
      type: "money",
      total: "none",
      note: "The same figure as the in or out column beside it, whichever applies. NOT totalled — adding it up mixes money in with money out.",
    },
    {
      key: "proof_type",
      label: "Proof",
      type: "text",
      width: 16,
      // Only the entry with NOTHING behind it. A voucher is not better or worse
      // than a bill - both are proof - so neither is coloured.
      badge: { "No proof kept": "bad" },
      note: "What KIND of slip was kept. Separate from whether a photo is attached.",
    },
    {
      key: "proof_other",
      label: "Proof, in their words",
      type: "text",
      width: 22,
      optional: true,
    },
    {
      key: "has_receipt",
      label: "Receipt attached",
      type: "boolean",
      // Amber where there is no scan. Not red: a missing PHOTO is a chase, a
      // missing PROOF is an entry nobody can substantiate, and the two must not
      // read as the same severity.
      badge: { No: "warn" },
      note: "Whether a file is attached. The pictures themselves are on the Receipts sheet.",
    },
    {
      key: "receipt_count",
      label: "Files attached",
      type: "number",
      optional: true,
    },
    {
      key: "receipt_files",
      label: "Receipt file(s)",
      type: "text",
      width: 30,
      optional: true,
      note: "The uploaded file names. The PICTURES themselves are on the Receipts sheet, one row per file beside the entry it proves — they are not in this cell because Excel does not move a floating picture when a range is sorted, and a receipt over the wrong payment is worse than no receipt.",
    },
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
        return (rows as unknown as { v: string }[]).map((r) => ({
          value: r.v,
          label: r.v,
        }));
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
