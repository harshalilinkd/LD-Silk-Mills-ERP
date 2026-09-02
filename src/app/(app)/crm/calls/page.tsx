import Link from "next/link";
import {
  IconAlertTriangle,
  IconHistory,
  IconMessage2,
  IconPhoneCall,
  IconRepeat,
  IconSearch,
} from "@tabler/icons-react";

import { loadCalls } from "@/lib/order-entry/crm-query";
import { formatCount } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { CallRow } from "@/components/order-entry/crm/call-row";
import { cn } from "@/lib/utils";

// CRM → Call log (source: components/crm/calls-log.tsx, §12.5.6). A
// READ-ONLY record of every follow-up that was actually worked — contacted,
// rated, given feedback, or closed — newest first. There are no write
// actions anywhere on this page; the queue where a coordinator actually
// works a call lives elsewhere (the follow-up queue, still a follow-up
// phase). Data comes straight from loadCalls() server-side — no client
// fetch, no react-query — with exactly one small client component
// (CallRow) for the inline expand/collapse.

type SP = Record<string, string | undefined>;

/** Builds a /crm/calls href from the current search params plus overrides.
 *  An override of `undefined` removes that param (used to reset `page`
 *  whenever a filter changes, and to clear q/from/to on "Clear"). */
function hrefWith(sp: SP, overrides: Record<string, string | number | undefined>): string {
  const merged = new URLSearchParams();
  const combined: SP = {
    q: sp.q,
    from: sp.from,
    to: sp.to,
    has: sp.has,
    page: sp.page,
  };
  for (const [k, v] of Object.entries(overrides)) {
    combined[k] = v === undefined ? undefined : String(v);
  }
  for (const [k, v] of Object.entries(combined)) {
    if (v) merged.set(k, v);
  }
  const qs = merged.toString();
  return `/crm/calls${qs ? `?${qs}` : ""}`;
}

function Kpi({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
}: {
  icon: typeof IconPhoneCall;
  iconClass: string;
  value: string;
  label: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-[10px] border border-border bg-surface p-[18px] transition-colors hover:bg-surface-2">
      <div className={cn("mb-3.5 flex size-8 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="size-[18px]" />
      </div>
      <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-text-1">{value}</div>
      <div className="mt-[3px] text-xs text-text-3">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const HAS_OPTIONS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Any" },
  { value: "feedback", label: "With feedback" },
  { value: "reorder", label: "With reorder signal" },
  { value: "rating", label: "With rating" },
];

const fieldCls =
  "h-9 rounded-lg border border-border-strong bg-transparent px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export default async function CrmCallsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);
  if (sp.has) params.set("has", sp.has);
  if (sp.page) params.set("page", sp.page);

  const data = await loadCalls(params);
  const hasFilters = !!(sp.q || sp.from || sp.to);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">Call log</h1>
        <p className="mt-1 text-[13px] text-text-3">
          Newest first · every follow-up that was actually contacted, rated, given feedback, or
          closed
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi
          icon={IconPhoneCall}
          iconClass="bg-accent text-primary"
          value={formatCount(data.kpis.calls)}
          label="Calls worked"
          href={hrefWith(sp, { has: undefined, page: undefined })}
        />
        <Kpi
          icon={IconMessage2}
          iconClass="bg-status-blue-dim text-status-blue"
          value={formatCount(data.kpis.withFeedback)}
          label="With feedback"
          href={hrefWith(sp, { has: "feedback", page: undefined })}
        />
        <Kpi
          icon={IconRepeat}
          iconClass="bg-status-green-dim text-status-green"
          value={formatCount(data.kpis.reorderSignals)}
          label="Reorder signals"
          href={hrefWith(sp, { has: "reorder", page: undefined })}
        />
        <Kpi
          icon={IconAlertTriangle}
          iconClass="bg-status-red-dim text-status-red"
          value={formatCount(data.kpis.escalated)}
          label="Escalated"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {HAS_OPTIONS.map((opt) => {
            const active = (sp.has ?? undefined) === opt.value;
            return (
              <Link
                key={opt.label}
                href={hrefWith(sp, { has: opt.value, page: undefined })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
                  active ? "bg-accent text-accent-text" : "bg-surface-2 text-text-2 hover:text-text-1",
                )}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        <form
          method="get"
          action="/crm/calls"
          className="flex flex-wrap items-center gap-2"
        >
          {sp.has ? <input type="hidden" name="has" value={sp.has} /> : null}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              max={sp.to || undefined}
              className={fieldCls}
              aria-label="From"
            />
            <span className="text-[11.5px] text-text-3">to</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              min={sp.from || undefined}
              className={fieldCls}
              aria-label="To"
            />
          </div>
          <div className="relative min-w-[220px] flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search order, party, or anything they said…"
              className={cn(fieldCls, "w-full pl-8")}
              aria-label="Search"
            />
          </div>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
          {hasFilters ? (
            <Link
              href={hrefWith(sp, { q: undefined, from: undefined, to: undefined, page: undefined })}
              className="text-[12px] font-medium text-text-3 hover:text-text-1"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
          <h2 className="text-[14.5px] font-bold text-text-1">Call log</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-text-3">
            {data.total}
          </span>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState
            icon={IconHistory}
            title="No calls recorded yet"
            description="This fills as the follow-up queue is worked."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {[
                    "Order",
                    "Delivered",
                    "Contacted",
                    "Status",
                    "Attempts",
                    "Channels",
                    "Rating",
                    "Reorder",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-border px-3.5 pt-3.5 pb-2.5 text-left text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="border-b border-border px-3.5 pt-3.5 pb-2.5 text-right text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase">
                    Issues
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {data.rows.map((r) => (
                  <CallRow key={r.followupId} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            {data.page > 1 ? (
              <Link
                href={hrefWith(sp, { page: data.page - 1 })}
                className="text-[12.5px] font-semibold text-accent-text hover:underline"
              >
                ← Prev
              </Link>
            ) : (
              <span className="text-[12.5px] font-semibold text-text-3">← Prev</span>
            )}
            <span className="text-[12px] text-text-3">
              Page {data.page} of {data.totalPages}
            </span>
            {data.page < data.totalPages ? (
              <Link
                href={hrefWith(sp, { page: data.page + 1 })}
                className="text-[12.5px] font-semibold text-accent-text hover:underline"
              >
                Next →
              </Link>
            ) : (
              <span className="text-[12.5px] font-semibold text-text-3">Next →</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
