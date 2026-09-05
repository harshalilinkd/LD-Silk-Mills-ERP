"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconPaperclip,
  IconPlus,
  IconScale,
  IconWallet,
} from "@tabler/icons-react";

import { formatDate, formatDateLong } from "@/lib/dates";
import {
  PROOF_TYPES,
  PROOF_TYPE_META,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_META,
  formatMoney,
  formatSigned,
  proofLabel,
} from "@/lib/petty-cash/money";
import type {
  LedgerPage,
  LedgerRow,
  LedgerSort,
  Totals,
} from "@/lib/petty-cash/queries";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorNote,
  FilterField,
  FilterPanel,
  FiltersButton,
  Input,
  PageHead,
  PrimaryButton,
  QuietButton,
  SearchBox,
  Select,
  TableCard,
  Toolbar,
  td,
  th,
} from "@/components/ui/module-parts";
import { usePettyCashViewer } from "./viewer-context";
import { EntryDialog, type EntryDraft, type Option } from "./entry-dialog";
import { EntryDetail } from "./entry-detail";

/**
 * The ledger.
 *
 * ── TWO BALANCES, AND THEY ARE DIFFERENT QUESTIONS ───────────────────────
 *
 * "Current balance" is the whole box and never moves when a filter changes.
 * The moment a filter IS on, a second strip appears saying what that selection
 * adds up to. Showing one filtered figure under the words "Current Balance" is
 * how somebody concludes the cash has gone missing.
 *
 * ── A ROW IS A BUTTON ────────────────────────────────────────────────────
 *
 * Clicking anywhere on it opens the entry. The spec is right that a tiny edit
 * icon should not be the only way to understand a line — and on a phone it is
 * the only target anybody can hit.
 */
export function LedgerScreen({
  ledger,
  overall,
  filtered,
  employees,
  categories,
  fromOptions,
  sort,
  dir,
}: {
  ledger: LedgerPage;
  overall: Totals;
  filtered: Totals;
  employees: Option[];
  categories: (Option & { groupName: string })[];
  fromOptions: string[];
  sort: LedgerSort;
  dir: "asc" | "desc";
}) {
  const viewer = usePettyCashViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [showFilters, setShowFilters] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<EntryDraft | null>(null);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [error] = React.useState<string | null>(null);

  const q = params.get("q") ?? "";
  const [search, setSearch] = React.useState(q);
  React.useEffect(() => setSearch(q), [q]);

  const setParam = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      // Any filter change invalidates which page you were on.
      if (!("page" in patch)) next.delete("page");
      router.push(next.toString() ? `${pathname}?${next}` : pathname);
    },
    [params, pathname, router],
  );

  const PANEL_KEYS = ["type", "category", "payee", "proof", "from", "to", "on"] as const;
  const panelFilters = PANEL_KEYS.filter((k) => params.get(k)).length;
  const anyFilter = panelFilters + (params.get("q") ? 1 : 0);

  const totalPages = Math.max(1, Math.ceil(ledger.total / ledger.pageSize));
  const firstRow = ledger.total === 0 ? 0 : (ledger.page - 1) * ledger.pageSize + 1;
  const lastRow = Math.min(ledger.page * ledger.pageSize, ledger.total);

  const onDay = params.get("on");

  const sortLink = (key: LedgerSort) => () =>
    setParam({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" });

  const SortArrow = ({ k }: { k: LedgerSort }) =>
    sort !== k ? null : dir === "desc" ? (
      <IconArrowDown className="ml-1 inline size-3" />
    ) : (
      <IconArrowUp className="ml-1 inline size-3" />
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Cash box"
        title="Petty Cash"
        lede="Money paid out and put in, with the receipts behind it."
        action={
          viewer.can.create ? (
            <PrimaryButton onClick={() => setCreating(true)}>
              <IconPlus className="size-4" />
              New transaction
            </PrimaryButton>
          ) : undefined
        }
      />

      <ErrorNote>{error}</ErrorNote>
      {note && (
        <p className="rounded-field border border-status-green/30 bg-status-green-dim px-3 py-2 text-[12.5px] text-status-green">
          {note}
        </p>
      )}

      {/* ── the whole box, never filtered ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<IconScale className="size-4" />}
          label="Current balance"
          value={formatMoney(overall.balance)}
          sub="Everything in, less everything out"
          tone={Number(overall.balance) < 0 ? "red" : "blue"}
          emphasise
        />
        <Kpi
          icon={<IconArrowDown className="size-4" />}
          label="Total credit"
          value={formatMoney(overall.credits)}
          sub="Money put into the box"
          tone="green"
        />
        <Kpi
          icon={<IconArrowUp className="size-4" />}
          label="Total debit"
          value={formatMoney(overall.debits)}
          sub="Money paid out"
          tone="red"
        />
        <Kpi
          icon={<IconWallet className="size-4" />}
          label="Transactions"
          value={overall.count.toLocaleString("en-IN")}
          sub="Entries recorded"
          tone="grey"
        />
      </div>

      {/* ── one toolbar row ──────────────────────────────────────────── */}
      <Toolbar
        search={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam({ q: search || null });
            }}
          >
            <SearchBox
              value={search}
              onChange={setSearch}
              onBlur={() => setParam({ q: search || null })}
              placeholder="Search reference, reason, name, amount…"
            />
          </form>
        }
      >
        <span className="shrink-0 text-[12px] whitespace-nowrap text-text-3">
          {ledger.total === 0
            ? "0 records"
            : `${firstRow.toLocaleString("en-IN")}–${lastRow.toLocaleString("en-IN")} of ${ledger.total.toLocaleString("en-IN")}`}
        </span>
        <FiltersButton
          open={showFilters}
          active={panelFilters > 0}
          onClick={() => setShowFilters((v) => !v)}
        />
      </Toolbar>

      {/* Arriving from the Analysis calendar. Says where you are and offers
          the way back, rather than leaving somebody looking at one day with
          no idea why. */}
      {onDay && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-primary/30 bg-accent px-3 py-2 text-[12.5px] text-accent-text">
          <span>
            Showing only <strong className="font-semibold">{formatDateLong(onDay)}</strong>.
          </span>
          <button
            type="button"
            onClick={() => setParam({ on: null })}
            className="cursor-pointer font-semibold underline underline-offset-2"
          >
            Show every date
          </button>
        </div>
      )}

      {showFilters && (
        <FilterPanel
          active={anyFilter > 0}
          onClear={() => {
            setSearch("");
            router.push(pathname);
          }}
          columns="sm:grid-cols-3 lg:grid-cols-6"
        >
          <FilterField label="In or out">
            <Select
              value={params.get("type") ?? ""}
              onChange={(e) => setParam({ type: e.target.value || null })}
            >
              <option value="">Both</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TRANSACTION_TYPE_META[t].label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Category">
            <Select
              value={params.get("category") ?? ""}
              onChange={(e) => setParam({ category: e.target.value || null })}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Payee">
            <Select
              value={params.get("payee") ?? ""}
              onChange={(e) => setParam({ payee: e.target.value || null })}
            >
              <option value="">Everybody</option>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Proof">
            <Select
              value={params.get("proof") ?? ""}
              onChange={(e) => setParam({ proof: e.target.value || null })}
            >
              <option value="">Any</option>
              {PROOF_TYPES.map((p) => (
                <option key={p} value={p}>
                  {PROOF_TYPE_META[p].label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="From date">
            <Input
              type="date"
              className="num"
              value={params.get("from") ?? ""}
              onChange={(e) => setParam({ from: e.target.value || null, on: null })}
            />
          </FilterField>

          <FilterField label="To date">
            <Input
              type="date"
              className="num"
              value={params.get("to") ?? ""}
              onChange={(e) => setParam({ to: e.target.value || null, on: null })}
            />
          </FilterField>
        </FilterPanel>
      )}

      {/* What the CURRENT SELECTION adds up to — only when something is
          actually selected, so it never competes with the box's own balance. */}
      {anyFilter > 0 && ledger.total > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-field border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
          <span className="font-semibold text-text-2">
            {filtered.count === 1 ? "This one entry:" : `These ${filtered.count} entries:`}
          </span>
          <span className="text-text-3">
            in{" "}
            <strong className="num font-bold text-status-green">
              {formatMoney(filtered.credits)}
            </strong>
          </span>
          <span className="text-text-3">
            out{" "}
            <strong className="num font-bold text-status-red">
              {formatMoney(filtered.debits)}
            </strong>
          </span>
          <span className="text-text-3">
            net{" "}
            <strong
              className={cn(
                "num font-bold",
                Number(filtered.balance) < 0 ? "text-status-red" : "text-status-green",
              )}
            >
              {formatMoney(filtered.balance)}
            </strong>
          </span>
        </div>
      )}

      {/* ── the ledger ───────────────────────────────────────────────── */}
      {ledger.rows.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconWallet className="size-5" />}
              title={anyFilter > 0 ? "Nothing matches those filters" : "No transactions yet"}
              body={
                anyFilter > 0
                  ? "Try clearing a filter or widening the dates."
                  : "Record the first payment in or out and the balance starts from there."
              }
              action={
                anyFilter > 0 ? (
                  <QuietButton onClick={() => router.push(pathname)}>Clear filters</QuietButton>
                ) : viewer.can.create ? (
                  <PrimaryButton onClick={() => setCreating(true)}>
                    <IconPlus className="size-4" />
                    New transaction
                  </PrimaryButton>
                ) : undefined
              }
            />
          }
        />
      ) : (
        <>
          <TableCard>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>
                    <button
                      type="button"
                      onClick={sortLink("date")}
                      className="cursor-pointer uppercase"
                    >
                      Date <SortArrow k="date" />
                    </button>
                  </th>
                  <th className={th}>Reference</th>
                  <th className={th}>Parties</th>
                  <th className={cn(th, "w-full")}>What for</th>
                  <th className={th}>
                    <button
                      type="button"
                      onClick={sortLink("category")}
                      className="cursor-pointer uppercase"
                    >
                      Category <SortArrow k="category" />
                    </button>
                  </th>
                  <th className={th}>Proof</th>
                  <th className={cn(th, "text-right")}>
                    <button
                      type="button"
                      onClick={sortLink("amount")}
                      className="cursor-pointer uppercase"
                    >
                      Amount <SortArrow k="amount" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r) => (
                  <Row key={r.id} row={r} onOpen={() => setOpenId(r.id)} />
                ))}
              </tbody>
            </table>
          </TableCard>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-3">
                Showing {firstRow.toLocaleString("en-IN")}–{lastRow.toLocaleString("en-IN")} of{" "}
                {ledger.total.toLocaleString("en-IN")}
              </span>
              <Select
                aria-label="Rows per page"
                className="h-8 w-auto"
                value={String(ledger.pageSize)}
                onChange={(e) => setParam({ size: e.target.value, page: null })}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} rows
                  </option>
                ))}
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <QuietButton
                  disabled={ledger.page <= 1}
                  onClick={() => setParam({ page: String(ledger.page - 1) })}
                >
                  <IconChevronLeft className="size-3.5" />
                  Previous
                </QuietButton>
                <span className="text-[12px] text-text-3">
                  Page {ledger.page} of {totalPages}
                </span>
                <QuietButton
                  disabled={ledger.page >= totalPages}
                  onClick={() => setParam({ page: String(ledger.page + 1) })}
                >
                  Next
                  <IconChevronRight className="size-3.5" />
                </QuietButton>
              </div>
            )}
          </div>
        </>
      )}

      {(creating || editing) && (
        <EntryDialog
          open
          draft={editing}
          employees={employees}
          categories={categories}
          fromOptions={fromOptions}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setCreating(false);
            setEditing(null);
            setOpenId(null);
            setNote(msg);
          }}
        />
      )}

      {openId !== null && (
        <EntryDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(draft) => {
            setOpenId(null);
            setEditing(draft);
          }}
          onDeleted={(uid) => {
            setOpenId(null);
            setNote(`Transaction ${uid} deleted successfully.`);
          }}
        />
      )}
    </div>
  );
}

/** One ledger line. The whole row opens it — see the header. */
function Row({ row, onOpen }: { row: LedgerRow; onOpen: () => void }) {
  const meta = TRANSACTION_TYPE_META[row.transactionType];
  return (
    <tr
      onClick={onOpen}
      tabIndex={0}
      role="button"
      aria-label={`Open ${row.uid}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
    >
      <td className={cn(td, "num whitespace-nowrap")}>{formatDate(row.transactionDate)}</td>
      <td className={cn(td, "num whitespace-nowrap text-text-3")}>{row.uid}</td>
      <td className={cn(td, "whitespace-nowrap")}>
        <div className="flex flex-col">
          <span className="font-semibold text-text-1">{row.toName}</span>
          {row.fromName && (
            <span className="text-[11.5px] text-text-3">From: {row.fromName}</span>
          )}
        </div>
      </td>
      <td className={cn(td, "max-w-[320px] truncate")} title={row.reason}>
        {row.reason}
      </td>
      <td className={cn(td, "whitespace-nowrap")}>
        <span className={cn("rounded-pill px-2 py-0.5 text-[11.5px] font-semibold", meta.chip)}>
          {row.categoryName}
        </span>
      </td>
      <td className={cn(td, "whitespace-nowrap")}>
        {row.hasAttachment ? (
          // A row with a photo behind it must not print "No proof" beside a
          // paperclip. `proof_type` is what KIND of slip was kept and NONE is a
          // real answer to that; the attachment is a separate fact, and when it
          // is the only one, "Receipt" is what it is.
          <span className="inline-flex items-center gap-1 text-[12px] text-text-2">
            <IconPaperclip className="size-3.5 text-text-3" />
            {row.proofType === "NONE" ? "Receipt" : proofLabel(row.proofType, row.proofOther)}
          </span>
        ) : row.proofType === "NONE" ? (
          <span className="text-[12px] text-text-3">—</span>
        ) : (
          <span className="text-[12px] text-text-2">
            {proofLabel(row.proofType, row.proofOther)}
          </span>
        )}
      </td>
      <td className={cn(td, "num text-right font-bold whitespace-nowrap", meta.text)}>
        {formatSigned(row.amount, row.transactionType)}
      </td>
    </tr>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  emphasise,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "green" | "red" | "blue" | "grey";
  emphasise?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border bg-surface p-3.5",
        emphasise ? "border-primary/30" : "border-border",
      )}
    >
      <span
        className={cn(
          "grid size-7 place-items-center rounded-field",
          tone === "green" && "bg-status-green-dim text-status-green",
          tone === "red" && "bg-status-red-dim text-status-red",
          tone === "blue" && "bg-accent text-accent-text",
          tone === "grey" && "bg-chip text-text-2",
        )}
      >
        {icon}
      </span>
      <div
        className={cn(
          "num mt-2 leading-none font-bold tracking-[-0.02em]",
          emphasise ? "text-[28px]" : "text-[24px]",
          tone === "red" && !emphasise ? "text-status-red" : "text-text-1",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-text-3">{sub}</div>
    </div>
  );
}
