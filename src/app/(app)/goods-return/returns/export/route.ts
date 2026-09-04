import { NextResponse, type NextRequest } from "next/server";

import { canOpenGoodsReturn } from "@/lib/goods-return/authz";
import {
  getReturnsForExport,
  type ReturnStatus,
} from "@/lib/goods-return/returns-query";

/**
 * The filtered list as a CSV.
 *
 * Ported from the standalone app's `app/(app)/returns/export/route.ts`, with
 * two changes and no others.
 *
 *   · The guard is `canOpenGoodsReturn()`, so it answers the same question the
 *     screens do. The original checked only "is anybody signed in", which in
 *     this shell would let every employee download all 341 returns and every
 *     amount on them regardless of whether they have the module.
 *   · The query-string keys match the LIST screen (`q`, `party`, `from`, `to`)
 *     rather than the original's (`search`, `partyId`, `dateFrom`, `dateTo`).
 *     The Export button hands over the page's own URL parameters verbatim, and
 *     two vocabularies for one filter is how an export quietly stops matching
 *     the table it was exported from.
 *
 * NO PAGINATION, on purpose: this is the whole filtered set, which is the point
 * of an export. `getReturnsForExport` has no limit for the same reason.
 */

/** Minimal RFC-4180. Ported verbatim from the standalone app's `lib/csv.ts`. */
function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  // The BOM is load-bearing: without it Excel on Windows opens a UTF-8 CSV as
  // Latin-1 and every rupee sign and Indian name in the file is mangled.
  return "﻿" + lines.join("\r\n");
}

const asStatus = (v: string | null): ReturnStatus | undefined =>
  v === "posted" || v === "received" ? v : undefined;

const asInt = (v: string | null): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB") : "";

const fmtDateTime = (d: Date | null) =>
  d ? new Date(d).toLocaleString("en-GB") : "";

export async function GET(req: NextRequest) {
  const access = await canOpenGoodsReturn();
  if (!access) return new NextResponse("Not permitted", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const rows = await getReturnsForExport({
    search: sp.get("q") || undefined,
    status: asStatus(sp.get("status")),
    partyId: asInt(sp.get("party")),
    reason: sp.get("reason") || undefined,
    dateFrom: sp.get("from") || undefined,
    dateTo: sp.get("to") || undefined,
  });

  const headers = [
    "LD Id",
    "Date",
    "Entry For",
    "Bill No",
    "LR No",
    "Party",
    "Broker",
    "Reason",
    "Custom Reason",
    "Status",
    "Total Value",
    "Transport Value",
    "Other Charges",
    "Posted On",
    "Status Updated On",
    "Transport Value (Balasaheb)",
    "Bhiwandi Transport & Charges",
    "Quality Lines",
  ];

  const data = rows.map((r) => [
    r.displayId,
    fmtDate(r.dated),
    r.entryFor,
    r.billNo,
    r.trackingNo,
    r.partyName,
    r.brokerName,
    r.reason,
    r.customReason,
    // The word people use, not the stored enum — the same rule StatusPill
    // follows. A spreadsheet full of "posted" is a spreadsheet nobody can read.
    r.status === "received" ? "Received" : "Pending",
    r.totalValue,
    r.transportValue,
    r.otherCharges,
    fmtDate(r.postedOn),
    fmtDateTime(r.receivedAt),
    r.bhiwandiTransportValue,
    r.bhiwandiCharges,
    r.items,
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(headers, data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="goods-returns-${stamp}.csv"`,
    },
  });
}
