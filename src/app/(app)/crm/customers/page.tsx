import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconLink,
  IconLinkOff,
  IconMinus,
  IconSearch,
  IconStar,
  IconUsers,
} from "@tabler/icons-react";
import { loadCustomers } from "@/lib/order-entry/crm-query";
import {
  CUSTOMER_SIGNAL_LABEL,
  customerSignal,
  type CustomerRow,
  type CustomerSignal,
  type CustomerSort,
} from "@/lib/order-entry/crm";
import { formatCount, formatDate, formatNumber } from "@/lib/order-entry/orders";
import { EmptyState } from "@/components/shell/empty-state";
import { Pill } from "@/components/order-entry/crm/pill";
import { cn } from "@/lib/utils";

// CRM → Customers (§12.5.4, OE-P18). A READ-ONLY roll-up over orders,
// follow-ups and complaints — never a second customer master. There is
// deliberately no create/edit/delete and no row drill-down anywhere on this
// page, matching the source app exactly (components/crm/customers-view.tsx).
//
// Grouping: a customer is `crr_customer_id` when the order carries one,
// otherwise the party name as typed. Two spellings of one company where only
// one resolved to CRR show as TWO rows here — that is loadCustomers' rule,
// not a bug in this page.

type SP = Record<string, string | undefined>;

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: "value", label: "Value" },
  { value: "rating", label: "Rating" },
  { value: "issues", label: "Issues" },
  { value: "orders", label: "Orders" },
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

const RATED_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "any", label: "Rated" },
  { value: "low", label: "Low ≤3" },
  { value: "high", label: "High ≥4" },
];

const LINKED_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "yes", label: "Linked" },
  { value: "no", label: "Unlinked" },
];

const SIGNAL_TONE: Record<Exclude<CustomerSignal, "none">, "late" | "warn" | "progress" | "due"> = {
  at_risk: "late",
  unhappy: "warn",
  reorder: "progress",
  sample: "due",
};

/** Builds a /crm/customers URL from the CURRENT params with `patch` applied
 * on top. Any filter change drops `page` back to 1 (by simply not carrying
 * it forward) — only pagination links pass `page` explicitly. */
function filterHref(sp: SP, patch: Partial<Record<"q" | "sort" | "rated" | "linked" | "signal" | "page", string | null>>): string {
  const merged: Record<string, string | null | undefined> = {
    q: sp.q,
    sort: sp.sort,
    rated: sp.rated,
    linked: sp.linked,
    signal: sp.signal,
    ...patch,
  };
  const params = new URLSearchParams();
  for (const key of ["q", "sort", "rated", "linked", "signal", "page"] as const) {
    const v = merged[key];
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `/crm/customers?${qs}` : "/crm/customers";
}

function money(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  return `₹${formatNumber(n)}`;
}

function RatingTrend({ v }: { v: number | null }) {
  // Null means "too few rated follow-ups to compare" — left blank rather
  // than drawn as flat, which would claim evidence we don't have.
  if (v === null) return null;
  if (Math.abs(v) < 0.25) {
    return (
      <span className="inline-flex items-center text-text-3" title="Steady">
        <IconMinus className="size-3" />
      </span>
    );
  }
  const up = v > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold",
        up ? "text-status-green" : "text-status-red",
      )}
      title={`Recent ratings vs. older: ${up ? "+" : ""}${v.toFixed(1)}`}
    >
      {up ? <IconArrowUpRight className="size-3" /> : <IconArrowDownRight className="size-3" />}
      {up ? "+" : ""}
      {v.toFixed(1)}
    </span>
  );
}

function Kpi({
  icon: Icon,
  iconClass,
  value,
  label,
  href,
  active,
}: {
  icon: typeof IconUsers;
  iconClass: string;
  value: string;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-[10px] border p-[18px] transition-colors hover:bg-surface-2",
        active ? "border-primary/50 bg-surface-2" : "border-border bg-surface",
      )}
    >
      <div className={`mb-3.5 flex size-8 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="size-[18px]" />
      </div>
      <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-text-1">{value}</div>
      <div className="mt-[3px] text-xs text-text-3">{label}</div>
    </Link>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary/50 bg-accent text-accent-text"
          : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text-1",
      )}
    >
      {children}
    </Link>
  );
}

export default async function CrmCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const dbParams = new URLSearchParams();
  if (sp.q) dbParams.set("q", sp.q);
  if (sp.sort) dbParams.set("sort", sp.sort);
  if (sp.rated) dbParams.set("rated", sp.rated);
  if (sp.linked) dbParams.set("linked", sp.linked);
  if (sp.signal) dbParams.set("signal", sp.signal);
  if (sp.page) dbParams.set("page", sp.page);

  const data = await loadCustomers(dbParams);
  const sort: CustomerSort = (sp.sort as CustomerSort) || "value";
  const rated = sp.rated ?? "";
  const linked = sp.linked ?? "";
  const q = sp.q ?? "";
  const atRisk = sp.signal === "at_risk";
  const hasFilters = !!(q || rated || linked || sp.signal);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">Customers</h1>
          <p className="mt-1 text-[13px] text-text-3">
            A read-only view over orders, follow-ups and complaints — grouped by CRR
            customer where linked, by party name otherwise.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          icon={IconUsers}
          iconClass="bg-accent text-primary"
          value={formatCount(data.kpis.customers)}
          label="Customers"
          href="/crm/customers"
          active={!hasFilters}
        />
        <Kpi
          icon={IconLink}
          iconClass="bg-status-blue-dim text-status-blue"
          value={formatCount(data.kpis.linked)}
          label="Linked to CRR"
          href={filterHref(sp, { linked: "yes" })}
          active={linked === "yes"}
        />
        <Kpi
          icon={IconLinkOff}
          iconClass="bg-chip text-text-3"
          value={formatCount(data.kpis.unlinked)}
          label="Unlinked"
          href={filterHref(sp, { linked: "no" })}
          active={linked === "no"}
        />
        <Kpi
          icon={IconStar}
          iconClass="bg-status-amber-dim text-status-amber"
          value={formatCount(data.kpis.rated)}
          label="Rated"
          href={filterHref(sp, { rated: "any" })}
          active={rated === "any"}
        />
        <Kpi
          icon={IconAlertTriangle}
          iconClass="bg-status-red-dim text-status-red"
          value={formatCount(data.kpis.atRisk)}
          label="At risk"
          href={filterHref(sp, { signal: "at_risk" })}
          active={atRisk}
        />
      </div>

      {data.kpis.rated === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface px-4 py-3 text-[12.5px] text-text-3">
          <b className="text-text-1">No follow-up has been completed yet</b>, so rating,
          trend, complaints and last-contacted are empty for every customer. Orders and
          value below are real — the rest fills in as the follow-up queue is worked.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border bg-surface p-2.5">
        <form method="get" action="/crm/customers" className="relative min-w-[220px] flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Party name or CRR customer id…"
            className="h-8 w-full rounded-lg border border-border bg-transparent py-1 pr-2.5 pl-8 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-primary/50"
          />
          {sort !== "value" ? <input type="hidden" name="sort" value={sort} /> : null}
          {rated ? <input type="hidden" name="rated" value={rated} /> : null}
          {linked ? <input type="hidden" name="linked" value={linked} /> : null}
          {sp.signal ? <input type="hidden" name="signal" value={sp.signal} /> : null}
        </form>

        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-text-3">Rating</span>
          {RATED_OPTIONS.map((o) => (
            <FilterLink key={o.value || "all"} href={filterHref(sp, { rated: o.value || null })} active={rated === o.value}>
              {o.label}
            </FilterLink>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-text-3">CRR</span>
          {LINKED_OPTIONS.map((o) => (
            <FilterLink key={o.value || "all"} href={filterHref(sp, { linked: o.value || null })} active={linked === o.value}>
              {o.label}
            </FilterLink>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-text-3">Sort</span>
          {SORTS.map((s) => (
            <FilterLink key={s.value} href={filterHref(sp, { sort: s.value === "value" ? null : s.value })} active={sort === s.value}>
              {s.label}
            </FilterLink>
          ))}
        </div>

        {hasFilters ? (
          <Link
            href="/crm/customers"
            className="rounded-lg px-2 py-1 text-[12px] font-medium text-text-3 hover:text-text-1"
          >
            Clear filters
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2.5">
          <h2 className="text-[14.5px] font-bold text-text-1">Customer history</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-text-3">
            {formatCount(data.total)}
          </span>
          <span
            className="text-[11.5px] text-text-3"
            title="A view over orders, follow-ups and complaints — never a second customer master. Party names are shown exactly as typed."
          >
            read-only
          </span>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState icon={IconUsers} title="No customers match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {[
                    { label: "Customer", cls: "text-left w-full" },
                    { label: "Orders 12m", cls: "text-right" },
                    { label: "Value 12m", cls: "text-right" },
                    { label: "Avg rating", cls: "text-left" },
                    { label: "Issues (open/total)", cls: "text-right" },
                    { label: "Signal", cls: "text-left" },
                    { label: "Last order", cls: "text-left" },
                    { label: "Follow-ups due", cls: "text-right" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={cn(
                        "border-b border-border px-3.5 pb-2.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3",
                        h.cls,
                      )}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {data.rows.map((r: CustomerRow) => {
                  const sig = customerSignal(r);
                  return (
                    <tr key={r.key}>
                      <td className="border-b border-border px-3.5 py-3">
                        <div className="font-semibold text-text-1">{r.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-3">
                          {r.crrCustomerId !== null ? (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-2">
                              CRR #{r.crrCustomerId}
                            </span>
                          ) : (
                            <span
                              className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-text-3"
                              title="No CRR customer resolved — this row is grouped by the party name as typed."
                            >
                              unlinked
                            </span>
                          )}
                          {r.aliases.length > 0 ? (
                            <span className="truncate" title={r.aliases.join(", ")}>
                              also: {r.aliases.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-right font-mono text-text-2">
                        {r.orders12m || <span className="text-text-3">—</span>}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-right font-mono font-semibold text-text-1">
                        {money(r.value12m)}
                      </td>
                      <td className="border-b border-border px-3.5 py-3">
                        {r.avgRating === null ? (
                          <span className="text-text-3">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-[13px] font-semibold text-text-1">
                              {r.avgRating.toFixed(1)}
                            </span>
                            <span className="text-[11px] text-text-3">/5 ({r.ratedCount})</span>
                            <RatingTrend v={r.ratingTrend} />
                          </span>
                        )}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-right font-mono">
                        {r.totalIssues === 0 ? (
                          <span className="text-text-3">—</span>
                        ) : (
                          <>
                            <span
                              className={cn(
                                r.openIssues > 0 ? "font-semibold text-status-red" : "text-text-2",
                              )}
                            >
                              {r.openIssues}
                            </span>
                            <span className="text-text-3"> / {r.totalIssues}</span>
                          </>
                        )}
                      </td>
                      <td className="border-b border-border px-3.5 py-3">
                        {sig === "none" ? (
                          <span className="text-text-3">—</span>
                        ) : (
                          <Pill tone={SIGNAL_TONE[sig]}>{CUSTOMER_SIGNAL_LABEL[sig]}</Pill>
                        )}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-text-2">
                        {formatDate(r.lastOrderDate)}
                      </td>
                      <td className="border-b border-border px-3.5 py-3 text-right font-mono">
                        {r.followupsDue > 0 ? (
                          <span className="font-semibold text-text-1">{r.followupsDue}</span>
                        ) : (
                          <span className="text-text-3">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <span className="text-[12px] text-text-3">
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              {data.page > 1 ? (
                <Link
                  href={filterHref(sp, { page: String(data.page - 1) })}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                >
                  <IconChevronLeft className="size-3.5" />
                  Prev
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12.5px] font-medium text-text-3 opacity-50">
                  <IconChevronLeft className="size-3.5" />
                  Prev
                </span>
              )}
              {data.page < data.totalPages ? (
                <Link
                  href={filterHref(sp, { page: String(data.page + 1) })}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-2 hover:bg-surface-2 hover:text-text-1"
                >
                  Next
                  <IconChevronRight className="size-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12.5px] font-medium text-text-3 opacity-50">
                  Next
                  <IconChevronRight className="size-3.5" />
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
