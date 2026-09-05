import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import { isProofType, isTransactionType } from "@/lib/petty-cash/money";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  getCategories,
  getCurrentBalance,
  getEmployees,
  getFromOptions,
  getTotals,
  getTransactions,
  type LedgerFilters,
  type LedgerSort,
} from "@/lib/petty-cash/queries";
import { LedgerScreen } from "./ledger-screen";

export const metadata: Metadata = {
  title: "Petty Cash — LD Silk Mills ERP",
};

/**
 * The Petty Cash ledger — the module's front door.
 *
 * ── FILTERS LIVE IN THE URL ──────────────────────────────────────────────
 *
 * So a filtered view can be sent to somebody, survives a refresh, comes back
 * correctly from the Back button — and, the reason it matters most here, so
 * the Analysis calendar can link straight to one day: `/petty-cash?on=…`.
 *
 * ── SIX QUERIES, IN TURN ─────────────────────────────────────────────────
 *
 * The pool holds five connections and pipelined statements stall under the
 * transaction pooler; four concurrent is the ceiling this codebase keeps.
 * Awaiting them is simpler than counting, and each is either an indexed page
 * or an aggregate.
 */
export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) redirect("/");

  const sp = await searchParams;
  const one = (k: string): string | null => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };
  const num = (k: string): number | null => {
    const v = one(k);
    return v && /^\d+$/.test(v) ? Number(v) : null;
  };
  const isoOrNull = (k: string): IsoDate | null => {
    const v = one(k);
    return v && isIsoDate(v) ? v : null;
  };

  const typeRaw = one("type");
  const proofRaw = one("proof");
  const sortRaw = one("sort");

  const filters: LedgerFilters = {
    search: one("q"),
    type: typeRaw && isTransactionType(typeRaw) ? typeRaw : null,
    categoryId: num("category"),
    employeeId: num("payee"),
    proofType: proofRaw && isProofType(proofRaw) ? proofRaw : null,
    from: isoOrNull("from"),
    to: isoOrNull("to"),
    on: isoOrNull("on"),
  };

  const page = num("page") ?? 1;
  const sizeRaw = num("size");
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeRaw ?? 0)
    ? sizeRaw!
    : DEFAULT_PAGE_SIZE;
  const sort: LedgerSort =
    sortRaw === "amount" || sortRaw === "category" ? sortRaw : "date";
  const dir = one("dir") === "asc" ? "asc" : "desc";

  const ledger = await getTransactions(filters, { page, pageSize, sort, dir });
  // Two different questions, so two different queries: what the whole box
  // holds, and what the current filter adds up to. See `getCurrentBalance`.
  const overall = await getCurrentBalance();
  const filtered = await getTotals(filters);
  const employees = await getEmployees();
  const categories = await getCategories();
  const fromOptions = await getFromOptions();

  return (
    <LedgerScreen
      ledger={ledger}
      overall={overall}
      filtered={filtered}
      employees={employees.map((e) => ({ id: e.id, name: e.name }))}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        groupName: c.groupName,
      }))}
      fromOptions={fromOptions}
      sort={sort}
      dir={dir}
    />
  );
}
