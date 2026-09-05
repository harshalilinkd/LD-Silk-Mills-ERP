"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowBackUp,
  IconCheck,
  IconChecklist,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";

import { daysBetween, formatDate } from "@/lib/checklist/dates";
import {
  FREQUENCIES,
  FREQUENCY_META,
  frequencyLabelFor,
} from "@/lib/checklist/frequency";
import type { MasterPage } from "@/lib/checklist/master-query";
import { deriveStatus, STATUS_META } from "@/lib/checklist/status";
import { cn } from "@/lib/utils";
import { useChecklistViewer } from "../viewer-context";
import {
  EmptyState,
  ErrorNote,
  FilterField,
  FilterPanel,
  FiltersButton,
  Input,
  PageHead,
  QuietButton,
  SearchBox,
  Select,
  TableCard,
  Toolbar,
  td,
  th,
} from "../parts";
import { markDone, undoDone } from "./actions";

/**
 * The Master Checklist.
 *
 * ── THE FOUR CARDS ARE FILTERS, AND THEY SAY WHICH ONE IS ON ─────────────
 *
 * Pressing one narrows the table to it and the card stays lit; pressing it
 * again clears back to everything. Their counts are of everything matching the
 * OTHER filters, not of what is on screen — a card that read "0 delayed"
 * merely because you were looking at today would be actively misleading.
 *
 * ── TICKING OFF IS OPTIMISTIC, WITH A REAL FAILURE PATH ──────────────────
 *
 * The row turns green immediately, because on a shop floor a button that waits
 * a second gets pressed twice. If the write comes back refused the row goes
 * back to where it was and the reason is shown — including the one that is not
 * an error at all: somebody else ticked it a moment ago.
 */
export function MasterScreen({
  data,
  people,
  departments,
  page,
  pageSize,
  notOnList,
}: {
  data: MasterPage;
  people: { id: number; name: string; department: string | null }[];
  departments: string[];
  page: number;
  pageSize: number;
  notOnList?: boolean;
}) {
  const viewer = useChecklistViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Rows this browser has just ticked, so the table updates before the server
  // round trip finishes. Cleared by the refresh that follows.
  const [ticked, setTicked] = React.useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = React.useState(false);

  const status = params.get("status") ?? "Today";
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
      // Any change to a filter invalidates which page you are on.
      if (!("page" in patch)) next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const PANEL_KEYS = ["doer", "dept", "freq", "from", "to"] as const;
  // The dot on the Filters button reports only what is INSIDE the panel.
  // Search sits in the toolbar and the status cards are their own control, so
  // counting either would light the dot for something already visible.
  const panelFilters = PANEL_KEYS.filter((k) => params.get(k)).length;
  const activeFilters =
    panelFilters + (params.get("q") ? 1 : 0) + (status !== "Today" ? 1 : 0);

  const tick = async (key: string) => {
    setBusyKey(key);
    setError(null);
    try {
      const r = await markDone(key);
      if (r.ok && r.date) {
        setTicked((t) => ({ ...t, [key]: r.date! }));
        router.refresh();
      } else if (r.alreadyDone) {
        setError("Somebody had already ticked that one off. Refreshing.");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
    } finally {
      setBusyKey(null);
    }
  };

  const untick = async (key: string) => {
    setBusyKey(key);
    setError(null);
    try {
      await undoDone(key);
      setTicked((t) => {
        const next = { ...t };
        delete next[key];
        return next;
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be undone.");
    } finally {
      setBusyKey(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  if (notOnList) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead title="Master Checklist" />
        <TableCard
          empty={
            <EmptyState
              icon={<IconChecklist className="size-5" />}
              title="You are not on the doers list yet"
              body="Nothing has been assigned to you. An administrator adds people on the Doers screen — once you are on it, your work appears here."
            />
          }
        />
      </div>
    );
  }

  const CARDS = [
    { key: "Today", tone: "blue", n: data.counts.Today, blurb: "Due today" },
    { key: "Delayed", tone: "red", n: data.counts.Delayed, blurb: "Past their day" },
    { key: "Done", tone: "green", n: data.counts.Done, blurb: "Ticked off" },
    {
      key: "Upcoming Focus",
      tone: "amber",
      n: data.counts["Upcoming Focus"],
      blurb: "Due within a week",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow={viewer.isAdmin ? "Everybody" : "Your work"}
        title="Master Checklist"
        lede={
          viewer.isAdmin
            ? "Every dated duty across the company. Tick one off and it counts as on time if the day it was due has not passed."
            : "Your dated duties. Ticking one off on or before its day counts as on time."
        }
      />

      <ErrorNote>{error}</ErrorNote>

      {/* ── the four cards, which are the status filter ──────────────── */}
      {/* KPI tiles come FIRST, above the toolbar — the order docs/DESIGN.md
          fixed after CRM shipped a filter bar that ran above its tiles and
          pushed the first row of data below the fold. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map((c) => {
          const on = status === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setParam({ status: on ? "all" : c.key })}
              className={cn(
                "cursor-pointer rounded-card border p-3.5 text-left transition-colors",
                on
                  ? c.tone === "blue"
                    ? "border-status-blue/50 bg-status-blue-dim"
                    : c.tone === "red"
                      ? "border-status-red/50 bg-status-red-dim"
                      : c.tone === "green"
                        ? "border-status-green/50 bg-status-green-dim"
                        : "border-status-amber/50 bg-status-amber-dim"
                  : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
                  {c.key}
                </span>
                <span className="text-[10.5px] font-semibold text-text-3">
                  {on ? "× clear" : "filter"}
                </span>
              </div>
              <div
                className={cn(
                  "num mt-1 text-[26px] leading-none font-bold tracking-[-0.02em]",
                  c.tone === "blue" && "text-status-blue",
                  c.tone === "red" && "text-status-red",
                  c.tone === "green" && "text-status-green",
                  c.tone === "amber" && "text-status-amber",
                )}
              >
                {c.n.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-[11.5px] text-text-3">{c.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* ── one toolbar row, then the panel only if asked for ────────── */}
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
              placeholder="Search task name…"
            />
          </form>
        }
      >
        <span className="shrink-0 text-[12px] whitespace-nowrap text-text-3">
          <strong className="num font-semibold text-text-2">
            {data.total.toLocaleString("en-IN")}
          </strong>{" "}
          row{data.total === 1 ? "" : "s"}
        </span>
        <FiltersButton
          open={showFilters}
          active={panelFilters > 0}
          onClick={() => setShowFilters((v) => !v)}
        />
      </Toolbar>

      {showFilters && (
        <FilterPanel
          active={activeFilters > 0}
          onClear={() => {
            setSearch("");
            router.push(pathname);
          }}
          columns={viewer.isAdmin ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-3"}
        >
          {viewer.isAdmin && (
            <>
              <FilterField label="Doer">
                <Select
                  value={params.get("doer") ?? ""}
                  onChange={(e) => setParam({ doer: e.target.value || null })}
                >
                  <option value="">All doers</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FilterField>

              <FilterField label="Department">
                <Select
                  value={params.get("dept") ?? ""}
                  onChange={(e) => setParam({ dept: e.target.value || null })}
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </FilterField>
            </>
          )}

          <FilterField label="Frequency">
            <Select
              value={params.get("freq") ?? ""}
              onChange={(e) => setParam({ freq: e.target.value || null })}
            >
              <option value="">All frequencies</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f} · {FREQUENCY_META[f].label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="From">
            <Input
              type="date"
              className="num"
              value={params.get("from") ?? ""}
              onChange={(e) => setParam({ from: e.target.value || null })}
            />
          </FilterField>

          <FilterField label="To">
            <Input
              type="date"
              className="num"
              value={params.get("to") ?? ""}
              onChange={(e) => setParam({ to: e.target.value || null })}
            />
          </FilterField>
        </FilterPanel>
      )}

      {/* ── the table ───────────────────────────────────────────────── */}
      {data.rows.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconChecklist className="size-5" />}
              title={
                status === "Today"
                  ? "Nothing due today"
                  : "Nothing matches those filters"
              }
              body={
                status === "Today"
                  ? "Sundays and holidays are skipped, so an empty day is often just a day off. Press one of the cards above to look at another set."
                  : "Try clearing a filter, or widening the date range."
              }
            />
          }
        />
      ) : (
        <TableCard>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {viewer.isAdmin && <th className={th}>Doer</th>}
                {viewer.isAdmin && <th className={th}>Department</th>}
                <th className={cn(th, "w-full")}>Task</th>
                <th className={th}>Freq</th>
                <th className={th}>Planned</th>
                <th className={th}>Actual</th>
                <th className={th}>Delay</th>
                <th className={th}>Status</th>
                <th className={cn(th, "text-right")}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const localDate = ticked[r.occurrenceKey];
                const effective = localDate
                  ? { ...r, status: "Done" as const, actualDate: localDate }
                  : r;
                const derived = deriveStatus(
                  {
                    status: effective.status,
                    plannedDate: effective.plannedDate,
                    frequency: effective.frequency,
                  },
                  data.today,
                );
                const meta = STATUS_META[derived];
                const late =
                  effective.actualDate && effective.actualDate > effective.plannedDate
                    ? daysBetween(effective.plannedDate, effective.actualDate)
                    : derived === "Delayed"
                      ? daysBetween(effective.plannedDate, data.today)
                      : 0;
                const mine = viewer.doerId === r.doerId;

                return (
                  <tr
                    key={r.occurrenceKey}
                    className={cn(
                      "transition-colors hover:bg-surface-2",
                      localDate && "bg-status-green-dim/40",
                    )}
                  >
                    {viewer.isAdmin && (
                      <td className={cn(td, "whitespace-nowrap text-text-1")}>
                        {r.doerName}
                      </td>
                    )}
                    {viewer.isAdmin && (
                      <td className={cn(td, "whitespace-nowrap")}>
                        {r.department || <span className="text-text-3">—</span>}
                      </td>
                    )}
                    <td className={cn(td, "text-text-1")}>{r.taskName}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span title={frequencyLabelFor(r.frequency, r.plannedDate)}>
                        {r.frequency}
                      </span>
                    </td>
                    <td className={cn(td, "num whitespace-nowrap")}>
                      {formatDate(r.plannedDate)}
                    </td>
                    <td className={cn(td, "num whitespace-nowrap")}>
                      {effective.actualDate ? (
                        formatDate(effective.actualDate)
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                    <td className={cn(td, "num whitespace-nowrap")}>
                      {late > 0 ? (
                        <span className="font-semibold text-status-red">
                          {late}d
                        </span>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold",
                          meta.chip,
                        )}
                        title={meta.blurb}
                      >
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <div className="flex justify-end">
                        {effective.status === "Done" ? (
                          viewer.isAdmin ? (
                            <QuietButton
                              busy={busyKey === r.occurrenceKey}
                              onClick={() => void untick(r.occurrenceKey)}
                            >
                              <IconArrowBackUp className="size-3.5" />
                              Undo
                            </QuietButton>
                          ) : (
                            <span className="text-[12px] text-text-3">—</span>
                          )
                        ) : mine || viewer.isAdmin ? (
                          <button
                            type="button"
                            disabled={busyKey === r.occurrenceKey}
                            onClick={() => void tick(r.occurrenceKey)}
                            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-field bg-status-green px-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            <IconCheck className="size-3.5" />
                            Done
                          </button>
                        ) : (
                          <span className="text-[12px] text-text-3">
                            Not yours
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-text-3">
            Page {page} of {totalPages} · {data.total.toLocaleString("en-IN")} rows
          </span>
          <div className="flex gap-2">
            <QuietButton
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
            >
              <IconChevronLeft className="size-3.5" />
              Previous
            </QuietButton>
            <QuietButton
              disabled={page >= totalPages}
              onClick={() => setParam({ page: String(page + 1) })}
            >
              Next
              <IconChevronRight className="size-3.5" />
            </QuietButton>
          </div>
        </div>
      )}
    </div>
  );
}
