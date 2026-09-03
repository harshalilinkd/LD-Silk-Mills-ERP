"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { IconClipboardList, IconSearch } from "@tabler/icons-react";

import {
  OverdueBadge,
  PriorityChip,
  StatusBadge,
} from "@/components/help-slip/badges";
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  CheckRow,
  DateRangeFields,
  FILTER_TOOLBAR,
  FILTER_WELL,
  FilterGroup,
  FilterSelect,
  FilterSheet,
  StatusPills,
  departmentOptions,
  priorityOptions,
} from "@/components/help-slip/filters";
import {
  CountChip,
  ListState,
  LoadMore,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  SortHeader,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import type { ConcernStatus } from "@/db/help-slip/schema";
import { helpSlipGet } from "@/lib/help-slip/api-client";
import { departmentOf, relativeTime } from "@/lib/help-slip/format";
import { PRIORITY_META, STATUS_META } from "@/lib/help-slip/meta";
import { useDebouncedValue } from "@/lib/help-slip/use-debounced-value";
import { HELP_SLIP_STALE_TIME } from "@/lib/help-slip/use-unread-count";
import {
  ASSIGNEE_UNASSIGNED,
  DEFAULT_PC_FILTERS,
  PC_SORTS,
  activePcFilterCount,
  hasPcFilter,
  parseDateParam,
  parseDirection,
  parsePriorityParam,
  parseSort,
  parseStatusParam,
  type AssigneeOption,
  type PcListFilters,
  type PcListPayload,
  type PcSort,
} from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/** The filter well's caption — order-filters.tsx's `LABEL_CLASS`, verbatim. */
const WELL_LABEL = "text-[11px] font-medium text-text-2";

/**
 * All concerns — the coordinator's ARCHIVE.
 *
 * The dashboard is a QUEUE and answers "what needs me now". This answers
 * "where is that thing": nothing hidden by default, newest first, and every
 * dimension somebody might remember a concern by is a filter — who raised it,
 * which department, who is on it, what state, roughly when.
 *
 * Two screens because they are two questions. One screen would answer neither,
 * which is what "just add a Show resolved toggle to the queue" becomes.
 *
 * The URL matters more here than on the employee list: "every open concern in
 * Printing assigned to nobody" is a thing a coordinator wants to SEND to
 * somebody, and a URL is how you send it.
 *
 * Page size 25.
 *
 * ── LAYOUT ────────────────────────────────────────────────────────────────
 * Three regions, in the ERP's own list order (§E.1): toolbar → filter well →
 * the list panel. Every one of them is a bordered card on `bg-surface`;
 * nothing sits on the page ground, which is the structural difference between
 * this module and the rest of the ERP and the whole reason for the rebuild.
 */
export function AllConcerns() {
  const router = useRouter();
  const params = useSearchParams();

  const filters = React.useMemo(() => filtersFromParams(params), [params]);

  const apply = React.useCallback(
    (next: PcListFilters) => {
      router.replace(`/help-slip/all?${paramsFromFilters(next)}`, {
        scroll: false,
      });
    },
    [router],
  );

  // ── search: local state, debounced into the URL ────────────────────────
  const [term, setTerm] = React.useState(filters.search);
  const debounced = useDebouncedValue(term, 300);

  React.useEffect(() => {
    setTerm(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    if (debounced !== filters.search) apply({ ...filters, search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const qs = paramsFromFilters(filters);

  const q = useInfiniteQuery({
    queryKey: ["help-slip", "all-concerns", qs],
    queryFn: ({ pageParam }) =>
      helpSlipGet<PcListPayload>(
        `/api/help-slip/all-concerns?${qs}&page=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const rows = React.useMemo(
    () => q.data?.pages.flatMap((p) => p.rows) ?? [],
    [q.data],
  );
  const first = q.data?.pages[0];
  const total = first?.total ?? 0;
  const departments = first?.departments ?? [];
  const assignees: AssigneeOption[] = first?.assignees ?? [];
  const filtered = hasPcFilter(filters);

  const [draft, setDraft] = React.useState<PcListFilters>(filters);

  const clearAll = () => {
    setTerm("");
    apply(DEFAULT_PC_FILTERS);
  };

  const sortBy = (key: PcSort) =>
    apply({
      ...filters,
      sort: key,
      direction:
        filters.sort === key && filters.direction === "desc" ? "asc" : "desc",
    });

  const th = (key: PcSort, label: string) => (
    <SortHeader
      label={label}
      active={filters.sort === key}
      direction={filters.direction}
      onSort={() => sortBy(key)}
    />
  );

  const assigneeSelectOptions = [
    { value: "", label: "Anyone" },
    { value: ASSIGNEE_UNASSIGNED, label: "Unassigned" },
    ...assignees.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    // `gap-5` — the ERP page rhythm, and now load-bearing: `PageHeader` carries
    // no bottom padding of its own, so this root is the only thing separating
    // the title from the first card.
    <div className="flex flex-col gap-5 pb-6">
      <Reveal index={0}>
        <PageHeader
          titleEn="All concerns"
          subtitle="Everything on record. The dashboard is for what needs you now."
          meta={total > 0 ? `Showing ${rows.length} of ${total}` : null}
        />
      </Reveal>

      {/* ═══ controls ═══════════════════════════════════════════════════ *
       * TOOLBAR then WELL, the ERP's own two-part filter region (§E.2/§D.6).
       * The toolbar CARDS the controls somebody reaches on every visit —
       * search, the status pills, the way out — and the recessed well below it
       * holds the four narrowing dimensions in a grid with visible captions,
       * because four unlabelled selects in one wrapping row is a puzzle rather
       * than a filter bar. Below `md` the whole well is the bottom sheet.    */}
      <Reveal index={1}>
        <div className="flex flex-col gap-2.5">
          <div className={FILTER_TOOLBAR}>
            <SearchField
              value={term}
              onChange={setTerm}
              label="Search all concerns"
              placeholder="Number, title or who raised it"
            />

            <div className="md:hidden">
              <FilterSheet
                activeCount={activePcFilterCount(filters)}
                onOpen={() => setDraft(filters)}
                onApply={() => apply(draft)}
                onReset={() =>
                  setDraft({ ...DEFAULT_PC_FILTERS, search: draft.search })
                }
              >
                <FilterGroup labelEn="Status">
                  <div className="flex flex-col">
                    {ALL_STATUSES.map((s) => (
                      <CheckRow
                        key={s}
                        checked={draft.status.includes(s)}
                        onToggle={() =>
                          setDraft({
                            ...draft,
                            status: draft.status.includes(s)
                              ? draft.status.filter((x) => x !== s)
                              : [...draft.status, s],
                          })
                        }
                        labelEn={STATUS_META[s].labelEn}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup labelEn="Priority">
                  <div className="flex flex-col">
                    {ALL_PRIORITIES.map((p) => (
                      <CheckRow
                        key={p}
                        checked={draft.priority.includes(p)}
                        onToggle={() =>
                          setDraft({
                            ...draft,
                            priority: draft.priority.includes(p)
                              ? draft.priority.filter((x) => x !== p)
                              : [...draft.priority, p],
                          })
                        }
                        labelEn={PRIORITY_META[p].labelEn}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup labelEn="Department">
                  <FilterSelect
                    ariaLabel="Department"
                    value={draft.departmentId ?? ""}
                    onChange={(v) =>
                      setDraft({ ...draft, departmentId: v || null })
                    }
                    options={departmentOptions(departments, "Any department")}
                    className="w-full"
                  />
                </FilterGroup>

                <FilterGroup labelEn="Assigned to">
                  <FilterSelect
                    ariaLabel="Assigned to"
                    value={draft.assignee ?? ""}
                    onChange={(v) =>
                      setDraft({ ...draft, assignee: v || null })
                    }
                    options={assigneeSelectOptions}
                    className="w-full"
                  />
                </FilterGroup>

                <FilterGroup labelEn="Filed between">
                  <DateRangeFields
                    from={draft.from}
                    to={draft.to}
                    onChange={(range) => setDraft({ ...draft, ...range })}
                  />
                </FilterGroup>
              </FilterSheet>
            </div>

            {/* Status is the dimension a coordinator changes constantly, so it
                stays in the toolbar where the search is, not down in the well. */}
            <StatusPills
              value={filters.status}
              onChange={(status) => apply({ ...filters, status })}
              className="hidden md:flex"
            />

            {filtered ? (
              <button
                type="button"
                onClick={clearAll}
                // 44px below md, ERP-compact from md up. A bare text link is a
                // 20px touch target on a phone held on the factory floor.
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-field px-2 text-accent-text underline underline-offset-2 outline-none transition-colors hover:text-text-1 focus-visible:ring-3 focus-visible:ring-ring/40 md:h-9",
                  T.bodySm,
                )}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          {/* The recessed well, not a second card: it belongs to the toolbar
              region rather than beside the list, and a card inside a card
              reads as two things when it is one. From 768 only — below that
              these five dimensions live in the sheet above. */}
          <div className={cn(FILTER_WELL, "hidden md:block")}>
            <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className={WELL_LABEL}>Department</span>
                <FilterSelect
                  ariaLabel="Department"
                  value={filters.departmentId ?? ""}
                  onChange={(v) =>
                    apply({ ...filters, departmentId: v || null })
                  }
                  options={departmentOptions(departments, "Any department")}
                  className="w-full"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <span className={WELL_LABEL}>Assigned to</span>
                <FilterSelect
                  ariaLabel="Assigned to"
                  value={filters.assignee ?? ""}
                  onChange={(v) => apply({ ...filters, assignee: v || null })}
                  options={assigneeSelectOptions}
                  className="w-full"
                />
              </div>

              {/* Single-select: a coordinator narrowing by priority almost
                  always means "just Urgent" or "just High", not a combination.
                  The sheet keeps the multi-select for the rare case. */}
              <div className="flex min-w-0 flex-col gap-1">
                <span className={WELL_LABEL}>Priority</span>
                <FilterSelect
                  ariaLabel="Priority"
                  value={filters.priority[0] ?? ""}
                  onChange={(v) =>
                    apply({
                      ...filters,
                      priority: v ? [v as (typeof ALL_PRIORITIES)[number]] : [],
                    })
                  }
                  options={priorityOptions("All priorities")}
                  className="w-full"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <span className={WELL_LABEL}>Filed between</span>
                <DateRangeFields
                  from={filters.from}
                  to={filters.to}
                  onChange={(range) => apply({ ...filters, ...range })}
                  labelFrom="Filed from"
                  labelTo="Filed to"
                />
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ═══ the list ═══════════════════════════════════════════════════ */}
      <Reveal index={2}>
        <Panel
          className={cn(
            "transition-opacity",
            q.isFetching && !q.isFetchingNextPage && !q.isPending
              ? "opacity-60"
              : null,
          )}
        >
          <PanelHead
            titleEn="Concerns on record"
            icon={<IconClipboardList stroke={1.6} />}
            aside={total > 0 ? <CountChip>{total}</CountChip> : null}
          />

          <ListState
            loading={q.isPending}
            error={q.isError ? (q.error as Error).message : null}
            onRetry={() => void q.refetch()}
            isEmpty={rows.length === 0}
            empty={
              filtered
                ? {
                    icon: IconSearch,
                    titleEn: "No concerns match these filters.",
                    bodyEn: "Try a wider date range, or clear the filters.",
                    action: { label: "Clear filters", onClick: clearAll },
                  }
                : {
                    icon: IconClipboardList,
                    titleEn: "No concerns on record yet.",
                    bodyEn: "The first one an employee files will appear here.",
                  }
            }
          >
            {/* ── cards, < 768 ──────────────────────────────────────── */}
            <ul className="flex flex-col gap-2.5 p-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  {/* Staff land in the WORKSPACE, not the employee's view:
                      this is the archive a coordinator opens in order to do
                      something about a concern.

                      Order Entry's mobile row card, verbatim
                      (`orders/orders-dashboard.tsx`'s OrderCard): surface
                      ground, border-strong on hover, and a press scale. It
                      carries its own `shadow-sm` because `Panel` no longer
                      does — a shadow marks a press TARGET here, not a
                      panel. */}
                  <Link
                    href={`/help-slip/all/${row.id}`}
                    className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-sm transition-colors outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[.99]"
                  >
                    {/* Identity row: what it is on the left, what state it is
                        in on the right — the ERP mobile row card, §E.4. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={cn("num text-text-3", T.caption)}>
                          {row.concernNumber}
                        </span>
                        <p
                          className={cn(
                            "mt-0.5 line-clamp-2 text-text-1",
                            T.h3,
                          )}
                        >
                          {row.title}
                        </p>
                      </div>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={row.status} />
                        {row.isOverdue ? <OverdueBadge /> : null}
                      </span>
                    </div>

                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-1 text-text-3",
                        T.caption,
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {row.employeeName ?? "—"}
                      </span>
                      <span>{departmentOf(row)}</span>
                      <span className="num">{relativeTime(row.createdAt)}</span>
                    </div>

                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-2",
                        T.caption,
                      )}
                    >
                      <PriorityChip priority={row.priority} />
                      <span
                        className={cn(
                          "ml-auto",
                          !row.assignedToName && "text-text-3",
                        )}
                      >
                        {row.assignedToName ?? "Unassigned"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* ── table, ≥ 768. Seven columns. ──────────────────────── */}
            <div className="hidden md:block">
              <HScroll bodyClassName="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <Th>{th("concern_number", "ID")}</Th>
                      <Th className="w-full">{th("title", "Title")}</Th>
                      <Th className="hidden lg:table-cell">
                        {th("employee_name", "Raised by")}
                      </Th>
                      <Th className="hidden xl:table-cell">
                        {th("department_name", "Department")}
                      </Th>
                      <Th>{th("status", "Status")}</Th>
                      <Th className="hidden lg:table-cell">Assigned</Th>
                      <Th>{th("last_public_update_at", "Last update")}</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      // `relative`, so the ID cell's link can cover the
                      // whole row — one real <Link>, whole-row target.
                      <Tr key={row.id} className="relative">
                        <Td className="num whitespace-nowrap">
                          <Link
                            href={`/help-slip/all/${row.id}`}
                            aria-label={`${row.concernNumber}: ${row.title}`}
                            className="rounded-field outline-none after:absolute after:inset-0 after:content-[''] hover:text-accent-text focus-visible:text-accent-text focus-visible:underline"
                          >
                            {row.concernNumber}
                          </Link>
                        </Td>
                        <Td className="max-w-0">
                          <span className="flex items-center gap-2">
                            <span className="line-clamp-1">{row.title}</span>
                            <PriorityChip priority={row.priority} />
                          </span>
                        </Td>
                        <Td className="hidden whitespace-nowrap lg:table-cell">
                          {row.employeeName ?? "—"}
                        </Td>
                        <Td className="hidden whitespace-nowrap xl:table-cell">
                          {departmentOf(row)}
                        </Td>
                        <Td>
                          <span className="flex flex-wrap items-center gap-1">
                            <StatusBadge status={row.status} />
                            {row.isOverdue ? <OverdueBadge /> : null}
                          </span>
                        </Td>
                        <Td
                          className={cn(
                            "hidden whitespace-nowrap lg:table-cell",
                            !row.assignedToName && "text-text-3",
                          )}
                        >
                          {row.assignedToName ?? "Unassigned"}
                        </Td>
                        <Td className="num whitespace-nowrap text-text-3">
                          {row.lastPublicUpdateAt
                            ? relativeTime(row.lastPublicUpdateAt)
                            : "—"}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </HScroll>
            </div>
          </ListState>

          {/* The pager slot, on a solid card footer (§E.6). It used to sit on
              the page ground under the card, which is the one place in the ERP
              a control never sits. `LoadMore` brings its own `py-3`. */}
          {q.hasNextPage ? (
            <div className="border-t border-border px-4">
              <LoadMore
                onClick={() => void q.fetchNextPage()}
                loading={q.isFetchingNextPage}
                label="Load more"
              />
            </div>
          ) : null}
        </Panel>
      </Reveal>
    </div>
  );
}

// ─── URL ⇄ filters ─────────────────────────────────────────────────────────

function filtersFromParams(p: URLSearchParams): PcListFilters {
  const rawAssignee = p.get("assignee");
  return {
    search: p.get("q") ?? "",
    status: parseStatusParam(p.get("status")),
    priority: parsePriorityParam(p.get("priority")),
    departmentId: p.get("department") || null,
    assignee:
      rawAssignee === ASSIGNEE_UNASSIGNED
        ? ASSIGNEE_UNASSIGNED
        : rawAssignee || null,
    from: parseDateParam(p.get("from")),
    to: parseDateParam(p.get("to")),
    sort: parseSort(p.get("sort"), PC_SORTS, DEFAULT_PC_FILTERS.sort),
    direction: parseDirection(p.get("dir")),
  };
}

function paramsFromFilters(f: PcListFilters): string {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.status.length > 0)
    p.set("status", (f.status as ConcernStatus[]).join(","));
  if (f.priority.length > 0) p.set("priority", f.priority.join(","));
  if (f.departmentId) p.set("department", f.departmentId);
  if (f.assignee) p.set("assignee", f.assignee);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.sort !== DEFAULT_PC_FILTERS.sort) p.set("sort", f.sort);
  if (f.direction !== DEFAULT_PC_FILTERS.direction) p.set("dir", f.direction);
  return p.toString();
}
