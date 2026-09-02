"use client";

// CRM → Call log — docs/SCREENS.md §7.4
//
// The record of what customers said. It exists because three things were
// WRITE-ONLY: `notes` (the customer's own words), `reorder_note` (what they
// need next) and the per-criterion scores were written by the call panel and
// readable NOWHERE else. A coordinator could record "they want 2,000 m satin
// crepe in September" and nobody, sales included, could find it again without
// opening that one order. Complaints had a board; the rest of the call had
// nothing.
//
// > Anything the panel can record must be readable somewhere — check that
// > before adding a field.
//
// A log, not a queue: newest first, READ-ONLY, and it never lists a follow-up
// nobody has touched (an untouched DUE row is not work).

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconMessage2,
  IconPhoneCall,
  IconRefresh,
  IconSearch,
  IconShoppingBag,
} from "@tabler/icons-react";

import {
  CHANNEL_LABEL,
  DELAY_REASON_LABEL,
  STATUS_LABEL,
  type AttemptChannel,
  type CallList,
  type CallRecord,
  type DelayReason,
} from "@/lib/order-entry/crm";
import {
  formatCount,
  formatDateTime,
  formatNumber,
} from "@/lib/order-entry/orders";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import { cn } from "@/lib/utils";
import { HScroll } from "@/components/ui/hscroll";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { apiGet } from "./api-client";
import { Pill } from "./pill";
import { Stars } from "./stars";

const selectCls =
  "h-9 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const INTENT_LABEL: Record<string, string> = {
  none: "—",
  maybe: "Maybe",
  yes: "Buying again",
  sample_requested: "Asked for a sample",
};

function money(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${formatNumber(n)}`;
}

export function CallsLog() {
  const [rawSearch, setRawSearch] = React.useState("");
  const [has, setHas] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const search = useDebouncedValue(rawSearch, 250);

  const params = new URLSearchParams();
  params.set("page", String(page));
  if (has) params.set("has", has);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search) params.set("q", search);
  const qs = params.toString();

  const q = useQuery({
    queryKey: ["crm-calls", qs],
    queryFn: () => apiGet<CallList>(`/api/crm/calls?${qs}`),
    placeholderData: (prev) => prev,
  });

  React.useEffect(() => {
    setPage(1);
  }, [has, from, to, search]);

  const data = q.data;
  const rows = data?.rows ?? [];
  const k = data?.kpis;

  const only = (v: string) => () => setHas(has === v ? "" : v);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
        <StatCard
          className="py-2 sm:py-3"
          icon={<IconPhoneCall />}
          label="Calls worked"
          value={k ? formatCount(k.calls) : "—"}
          sub={has === "" ? "showing all" : "show all"}
          active={has === ""}
          onClick={() => setHas("")}
        />
        <StatCard
          className="py-2 sm:py-3"
          icon={<IconMessage2 />}
          label="With feedback"
          value={k ? formatCount(k.withFeedback) : "—"}
          tone="warning"
          sub={has === "feedback" ? "showing these" : "in their own words"}
          active={has === "feedback"}
          onClick={only("feedback")}
        />
        <StatCard
          className="py-2 sm:py-3"
          icon={<IconShoppingBag />}
          label="Reorder signals"
          value={k ? formatCount(k.reorderSignals) : "—"}
          tone="success"
          sub={has === "reorder" ? "showing these" : "wants something next"}
          active={has === "reorder"}
          onClick={only("reorder")}
        />
        {/* The ONE tile on any CRM screen that is not a filter: there is no
            `has=escalated` on the API, and inventing a client-side one would
            make its count disagree with the pager. */}
        <StatCard
          className="py-2 sm:py-3"
          icon={<IconAlertTriangle />}
          label="Escalated"
          value={k ? formatCount(k.escalated) : "—"}
          tone="danger"
          sub="flagged for review"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2.5 shadow-sm">
        <select
          className={selectCls}
          value={has}
          onChange={(e) => setHas(e.target.value)}
          aria-label="Show"
        >
          <option value="">Every worked call</option>
          <option value="feedback">Only with feedback</option>
          <option value="reorder">Only with a reorder signal</option>
          <option value="rating">Only rated</option>
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From"
            className={selectCls}
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-[11.5px] text-text-2">to</span>
          <input
            type="date"
            aria-label="To"
            className={selectCls}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
          {from || to ? (
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="cursor-pointer rounded-field px-1.5 py-1 text-[11.5px] font-medium text-text-2 hover:bg-chip hover:text-text-1"
            >
              Clear
            </button>
          ) : null}
        </div>

        {/* Search reaches INSIDE the feedback text and the reorder note —
            "who mentioned packing?" is the question this screen exists to
            answer. */}
        <div className="relative order-last w-full min-w-0 sm:order-none sm:w-auto sm:min-w-[220px] sm:flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-2" />
          <Input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Search order, party, or anything they said…"
            aria-label="Search"
            className="h-9 pl-8"
          />
        </div>

        <button
          type="button"
          onClick={() => void q.refetch()}
          title="Refresh"
          aria-label="Refresh"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1"
        >
          <IconRefresh className={cn("size-4", q.isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-2.5 sm:px-5">
          <h2 className="text-[15px] font-semibold text-text-1">Call log</h2>
          {data ? (
            <span className="num rounded-pill bg-chip px-2 py-0.5 text-[11.5px] font-semibold text-text-2">
              {data.total}
            </span>
          ) : null}
          <span className="hidden text-[12px] text-text-2 sm:inline">
            newest first · click a row for the whole call
          </span>
        </div>

        <HScroll bodyClassName="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th>Order no</Th>
                <Th>Party name</Th>
                <Th>Calling date</Th>
                <Th>Rating</Th>
                <Th className="w-full">Feedback</Th>
                <Th>Any new requirement</Th>
                <Th className="text-right">Issues</Th>
                <Th>Outcome</Th>
              </tr>
            </THead>
            <TBody>
              {q.isLoading ? (
                <tr>
                  <Td colSpan={8} className="py-10 text-center text-text-2">
                    Loading…
                  </Td>
                </tr>
              ) : q.isError ? (
                <tr>
                  <Td colSpan={8} className="px-4 py-10 text-center">
                    <div className="font-semibold text-status-red">
                      Could not load the call log
                    </div>
                    <div className="mx-auto mt-1 max-w-[60ch] text-[12.5px] text-text-2">
                      {(q.error as Error)?.message ?? "Unknown error"}
                    </div>
                    <button
                      type="button"
                      onClick={() => void q.refetch()}
                      className="mt-3 cursor-pointer rounded-field border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-text-2 hover:bg-chip hover:text-text-1"
                    >
                      Try again
                    </button>
                  </Td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <Td colSpan={8} className="py-10 text-center text-text-2">
                    No calls recorded yet. This fills as the follow-up queue is
                    worked.
                  </Td>
                </tr>
              ) : (
                rows.map((r) => (
                  <CallRow
                    key={r.followupId}
                    row={r}
                    open={openId === r.followupId}
                    onToggle={() =>
                      setOpenId(openId === r.followupId ? null : r.followupId)
                    }
                  />
                ))
              )}
            </TBody>
          </Table>
        </HScroll>

        {data && data.totalPages > 1 ? (
          <div className="border-t border-border px-4 py-2.5">
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onPageChange={setPage}
              disabled={q.isFetching}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-text-1 uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CallRow({
  row,
  open,
  onToggle,
}: {
  row: CallRecord;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <Tr
        onClick={onToggle}
        className={cn("cursor-pointer", open && "bg-accent hover:bg-accent")}
      >
        <Td className="num text-[13px] font-semibold whitespace-nowrap text-text-1">
          {row.orderNo}
        </Td>
        <Td className="max-w-[200px] truncate text-[12.5px] font-medium text-text-1">
          {row.partyName}
        </Td>
        <Td className="num text-[12.5px] whitespace-nowrap text-text-1">
          {row.contactedAt ? (
            <>
              <div>{formatDateTime(row.contactedAt)}</div>
              {row.completedBy ? (
                <div className="max-w-[150px] truncate text-[11.5px] text-text-2">
                  {row.completedBy}
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-text-2">not reached</span>
          )}
        </Td>
        <Td>
          {row.ratingOverall === null ? (
            <span className="text-text-2">—</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Stars value={row.ratingOverall} />
              <span className="num text-[12.5px] font-semibold">
                {row.ratingOverall}
              </span>
            </span>
          )}
        </Td>
        {/* The column this screen was built for. */}
        <Td className="max-w-0">
          {row.feedback?.trim() ? (
            <span
              className="line-clamp-2 text-[12.5px] leading-snug font-medium text-text-1"
              title={row.feedback}
            >
              {row.feedback}
            </span>
          ) : (
            <span className="text-[12.5px] text-text-2 italic">
              nothing recorded
            </span>
          )}
        </Td>
        <Td className="max-w-[190px]">
          {row.reorderIntent === "none" ? (
            <span className="text-text-2">—</span>
          ) : (
            <>
              <Pill
                tone={row.reorderIntent === "yes" ? "done" : "progress"}
                dot={false}
              >
                {INTENT_LABEL[row.reorderIntent]}
              </Pill>
              {row.reorderNote ? (
                <div
                  className="mt-0.5 truncate text-[12px] text-text-1"
                  title={row.reorderNote}
                >
                  {row.reorderNote}
                </div>
              ) : null}
            </>
          )}
        </Td>
        {/* A count you cannot open is a dead end. It deep-links to the issues
            board already searched for this order, with status=ALL so a resolved
            complaint is still reachable from the call that raised it. */}
        <Td className="num text-right">
          {row.issues ? (
            <Link
              href={`/crm/issues?q=${encodeURIComponent(row.orderNo)}&status=ALL`}
              onClick={(e) => e.stopPropagation()}
              title={`Open ${row.issues === 1 ? "this complaint" : "these complaints"} on the issues board`}
              className={cn(
                "inline-flex min-w-6 items-center justify-center rounded-pill px-2 py-0.5 font-semibold underline-offset-2 hover:underline",
                row.openIssues
                  ? "bg-status-red-dim text-status-red"
                  : "bg-chip text-text-1",
              )}
            >
              {row.issues}
            </Link>
          ) : (
            <span className="text-text-2">—</span>
          )}
        </Td>
        <Td>
          <Pill
            tone={
              row.status === "COMPLETED"
                ? "done"
                : row.status === "UNREACHABLE"
                  ? "warn"
                  : "progress"
            }
            dot={false}
          >
            {STATUS_LABEL[row.status]}
          </Pill>
          {row.isEscalated ? (
            <div className="mt-0.5 text-[11px] font-semibold text-status-red">
              escalated
            </div>
          ) : null}
        </Td>
      </Tr>

      {open ? (
        <tr className="border-b border-border bg-surface-2">
          <Td colSpan={8} className="px-5 py-4 whitespace-normal">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <Label>Scores</Label>
                {row.subRatings.length === 0 ? (
                  <p className="text-[12.5px] text-text-2">Not rated.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {/* Keyed by the criterion's `key` and labelled from the
                        criteria table, so a score survives its criterion being
                        retired. */}
                    {row.subRatings.map((s) => (
                      <li
                        key={s.key}
                        className="flex items-center justify-between gap-3 text-[12.5px]"
                      >
                        <span className="font-medium text-text-1">{s.label}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Stars value={s.value} size={12} />
                          <span className="num font-semibold">{s.value}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {row.ratingSource ? (
                  <p className="mt-2 text-[12px] text-text-2">
                    {row.ratingSource === "customer"
                      ? "The customer stated these."
                      : "The coordinator judged these."}
                  </p>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <Label>In their own words</Label>
                {row.feedback?.trim() ? (
                  <p className="rounded-field border-l-[3px] border-l-primary bg-surface px-3 py-3 text-[13px] leading-relaxed text-text-1">
                    {row.feedback}
                  </p>
                ) : (
                  <p className="text-[12.5px] text-text-2">
                    Nothing was written down for this call.
                  </p>
                )}

                {row.reorderNote ? (
                  <>
                    <Label className="mt-4">What they need next</Label>
                    <p className="rounded-field border-l-[3px] border-l-status-green bg-surface px-3 py-3 text-[13px] leading-relaxed text-text-1">
                      {row.reorderNote}
                    </p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-border pt-3 text-[12.5px] text-text-2">
              <span>
                Order value{" "}
                <b className="num text-text-1">{money(row.orderValue)}</b>
              </span>
              <span>
                Attempts <b className="num text-text-1">{row.attempts}</b>
                {row.channels.length
                  ? ` · ${row.channels
                      .map((c) => CHANNEL_LABEL[c as AttemptChannel] ?? c)
                      .join(", ")}`
                  : ""}
              </span>
              <span>
                On time, they said{" "}
                <b className="text-text-1">
                  {row.customerSaysOnTime === null
                    ? "not asked"
                    : row.customerSaysOnTime
                      ? "yes"
                      : `no${
                          row.delayReason
                            ? ` · ${DELAY_REASON_LABEL[row.delayReason as DelayReason] ?? row.delayReason}`
                            : ""
                        }`}
                </b>
              </span>
              {row.salesPerson ? (
                <span>
                  Sales <b className="text-text-1">{row.salesPerson}</b>
                </span>
              ) : null}
            </div>
          </Td>
        </tr>
      ) : null}
    </>
  );
}
