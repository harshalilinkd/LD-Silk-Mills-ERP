"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconFilter, IconSearch, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import { RETURN_REASONS } from "@/lib/goods-return/constants";
import { cn } from "@/lib/utils";

/**
 * The list toolbar — docs/DESIGN.md § List screens, followed exactly.
 *
 * Order is fixed across every list in the ERP: tiles, then ONE toolbar row with
 * search plus a Filters toggle, then the collapsed panel, then the table.
 * Search stays out in the open because it is how you find one row; everything
 * that NARROWS the set — status, party, reason, dates — collapses behind the
 * button, with a dot when any of it is active.
 *
 * ── WHY THE STATE IS THE URL ─────────────────────────────────────────────
 *
 * Every control writes to the query string and the server re-renders from it.
 * That costs a round trip per change, and buys three things worth more: a
 * filtered list can be sent to somebody as a link, the back button steps
 * through filter changes the way people expect, and the page stays a server
 * component — so the 341-row table never ships as JSON to the browser first.
 *
 * Search is debounced before it touches the URL. Without that, every keystroke
 * is a history entry and the back button becomes unusable.
 */
export function ReturnFilters({
  parties,
  total,
}: {
  parties: { id: number; name: string }[];
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(search, 350);
  const [open, setOpen] = React.useState(false);

  const status = params.get("status") ?? "";
  const partyId = params.get("party") ?? "";
  const reason = params.get("reason") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const activeCount =
    [status, partyId, reason, from, to].filter(Boolean).length;

  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Any filter change puts you back on page 1 — page 4 of the old result
      // set is a different, usually empty, page 4 of the new one.
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Only push when the DEBOUNCED value differs from what the URL already says,
  // so arriving on a filtered link does not immediately re-navigate.
  const urlQ = params.get("q") ?? "";
  React.useEffect(() => {
    if (debounced !== urlQ) push({ q: debounced || null });
    // `push` and `urlQ` both change identity on every render of a new URL;
    // depending on them here would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const field =
    "h-9 w-full rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none transition-colors focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[360px]">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="LD id, bill, LR, party, broker"
            aria-label="Search returns"
            className="h-9 pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text-1"
            >
              <IconX className="size-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setOpen((s) => !s)}
          aria-pressed={open}
        >
          <IconFilter className="size-4" /> Filters
          {activeCount > 0 && (
            <span className="ml-1 size-1.5 rounded-full bg-primary" />
          )}
        </Button>

        <span className="num ml-auto text-[12.5px] text-text-3">
          {total.toLocaleString("en-IN")} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-field border border-border bg-surface-2 p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
              Status
              <select
                value={status}
                onChange={(e) => push({ status: e.target.value || null })}
                className={field}
              >
                <option value="">All</option>
                <option value="posted">Pending</option>
                <option value="received">Received</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
              Party
              <select
                value={partyId}
                onChange={(e) => push({ party: e.target.value || null })}
                className={field}
              >
                <option value="">All</option>
                {parties.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
              Reason
              <select
                value={reason}
                onChange={(e) => push({ reason: e.target.value || null })}
                className={field}
              >
                <option value="">All</option>
                {RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => push({ from: e.target.value || null })}
                  className={cn(field, "num")}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => push({ to: e.target.value || null })}
                  className={cn(field, "num")}
                />
              </label>
            </div>
          </div>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() =>
                push({ status: null, party: null, reason: null, from: null, to: null })
              }
              className="cursor-pointer self-start text-[12px] font-semibold text-accent-text underline underline-offset-2"
            >
              Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
