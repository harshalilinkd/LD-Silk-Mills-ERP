"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { IconClipboardList, IconSearch } from "@tabler/icons-react";

import {
  OverdueBadge,
  PriorityChip,
  StatusBadge,
} from "@/components/help-slip/badges";
import { Bi } from "@/components/help-slip/bilingual";
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  CheckRow,
  DateRangeFields,
  FilterGroup,
  FilterSelect,
  FilterSheet,
  StatusPills,
  departmentOptions,
  priorityOptions,
} from "@/components/help-slip/filters";
import {
  ListState,
  LoadMore,
  PageHeader,
  Panel,
  SearchField,
  SortHeader,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import type { ConcernStatus } from "@/db/help-slip/schema";
import { helpSlipGet } from "@/lib/help-slip/api-client";
import { useHelpSlipLocale } from "@/lib/help-slip/context";
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
 */
export function AllConcerns() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useHelpSlipLocale();

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
    { value: "", label: "Anyone", labelHi: "कोई भी" },
    {
      value: ASSIGNEE_UNASSIGNED,
      label: "Unassigned",
      labelHi: "किसी को नहीं",
    },
    ...assignees.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div className="flex flex-col">
      <Reveal index={0}>
        <PageHeader
          titleEn="All concerns"
          titleHi="सभी शिकायतें"
          subtitle={
            <Bi
              en="Everything on record. The dashboard is for what needs you now."
              hi="रिकॉर्ड की हर शिकायत। डैशबोर्ड में वही है जिस पर अभी काम चाहिए।"
            />
          }
          meta={total > 0 ? `Showing ${rows.length} of ${total}` : null}
        />
      </Reveal>

      <div className="flex flex-col gap-10 pb-10">
        {/* ═══ controls ═══════════════════════════════════════════════ *
         * Search, the five filter dimensions and Clear share ONE row and one
         * baseline. On two rows they read as two unrelated toolbars.        */}
        <Reveal index={1}>
          <div className="flex flex-wrap items-center gap-3">
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
                <FilterGroup labelEn="Status" labelHi="स्थिति">
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
                        labelHi={STATUS_META[s].labelHi}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup labelEn="Priority" labelHi="प्राथमिकता">
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
                        labelHi={PRIORITY_META[p].labelHi}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup labelEn="Department" labelHi="विभाग">
                  <FilterSelect
                    ariaLabel="Department"
                    value={draft.departmentId ?? ""}
                    onChange={(v) =>
                      setDraft({ ...draft, departmentId: v || null })
                    }
                    options={departmentOptions(departments, "Any department")}
                    locale={locale}
                    className="w-full"
                  />
                </FilterGroup>

                <FilterGroup labelEn="Assigned to" labelHi="किसे सौंपी गई">
                  <FilterSelect
                    ariaLabel="Assigned to"
                    value={draft.assignee ?? ""}
                    onChange={(v) => setDraft({ ...draft, assignee: v || null })}
                    options={assigneeSelectOptions}
                    locale={locale}
                    className="w-full"
                  />
                </FilterGroup>

                <FilterGroup
                  labelEn="Filed between"
                  labelHi="दर्ज होने की तारीख़"
                >
                  <DateRangeFields
                    from={draft.from}
                    to={draft.to}
                    onChange={(range) => setDraft({ ...draft, ...range })}
                  />
                </FilterGroup>
              </FilterSheet>
            </div>

            {/* From 768, all five dimensions inline.
                The source's desktop toolbar carries four of them and leaves
                priority to the phone sheet only; a screen that advertises five
                filter dimensions should reach all five where it is widest. */}
            <div className="hidden flex-wrap items-center gap-3 md:flex">
              <StatusPills
                value={filters.status}
                onChange={(status) => apply({ ...filters, status })}
                locale={locale}
              />
              <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
              <FilterSelect
                ariaLabel="Department"
                value={filters.departmentId ?? ""}
                onChange={(v) =>
                  apply({ ...filters, departmentId: v || null })
                }
                options={departmentOptions(departments, "Any department")}
                locale={locale}
              />
              <FilterSelect
                ariaLabel="Assigned to"
                value={filters.assignee ?? ""}
                onChange={(v) => apply({ ...filters, assignee: v || null })}
                options={assigneeSelectOptions}
                locale={locale}
              />
              {/* Single-select: a coordinator narrowing by priority almost
                  always means "just Urgent" or "just High", not a combination.
                  The sheet keeps the multi-select for the rare case. */}
              <FilterSelect
                ariaLabel="Priority"
                value={filters.priority[0] ?? ""}
                onChange={(v) =>
                  apply({
                    ...filters,
                    priority: v ? [v as (typeof ALL_PRIORITIES)[number]] : [],
                  })
                }
                options={priorityOptions("All priorities", locale)}
                locale={locale}
              />
              <DateRangeFields
                from={filters.from}
                to={filters.to}
                onChange={(range) => apply({ ...filters, ...range })}
                labelFrom="Filed from"
                labelTo="Filed to"
              />
            </div>

            {filtered ? (
              <button
                type="button"
                onClick={clearAll}
                className={cn(
                  "deva cursor-pointer text-accent-text underline underline-offset-2",
                  T.bodySm,
                )}
              >
                <Bi en="Clear filters" hi="फ़िल्टर हटाएँ" />
              </button>
            ) : null}
          </div>
        </Reveal>

        {/* ═══ the list ═══════════════════════════════════════════════ */}
        <Reveal index={2}>
          <div className="flex flex-col gap-3">
            <Panel
              className={cn(
                "overflow-hidden transition-opacity",
                q.isFetching && !q.isFetchingNextPage && !q.isPending
                  ? "opacity-60"
                  : null,
              )}
            >
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
                        titleHi: "इन फ़िल्टर से कोई शिकायत नहीं मिली।",
                        bodyEn: "Try a wider date range, or clear the filters.",
                        bodyHi: "तारीख़ की सीमा बढ़ाएँ, या फ़िल्टर हटा दें।",
                        action: { label: "Clear filters", onClick: clearAll },
                      }
                    : {
                        icon: IconClipboardList,
                        titleEn: "No concerns on record yet.",
                        titleHi: "अभी कोई शिकायत दर्ज नहीं है।",
                        bodyEn:
                          "The first one an employee files will appear here.",
                        bodyHi:
                          "कर्मचारी जो पहली शिकायत दर्ज करेंगे वह यहाँ दिखेगी।",
                      }
                }
              >
                {/* ── cards, < 768 ──────────────────────────────────── */}
                <ul className="flex flex-col gap-3 p-3 md:hidden">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-col gap-2 rounded-card border border-border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("num text-text-3", T.caption)}>
                          {row.concernNumber}
                        </span>
                        <span className="flex items-center gap-1">
                          <StatusBadge status={row.status} locale={locale} />
                          {row.isOverdue ? (
                            <OverdueBadge locale={locale} />
                          ) : null}
                        </span>
                      </div>

                      <p className={cn("deva line-clamp-2 text-text-1", T.h3)}>
                        {row.title}
                      </p>

                      <p className={cn("deva text-text-3", T.caption)}>
                        {row.employeeName ?? "—"}
                        {" · "}
                        {departmentOf(row, locale)}
                        {" · "}
                        {relativeTime(row.createdAt, locale)}
                      </p>

                      <p
                        className={cn(
                          "deva flex flex-wrap items-center gap-2",
                          T.caption,
                        )}
                      >
                        <PriorityChip
                          priority={row.priority}
                          locale={locale}
                        />
                        <span
                          className={cn(
                            !row.assignedToName && "text-text-3",
                          )}
                        >
                          {row.assignedToName ?? "Unassigned"}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>

                {/* ── table, ≥ 768. Seven columns. ──────────────────── */}
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
                          <Tr key={row.id}>
                            <Td className="num whitespace-nowrap">
                              {row.concernNumber}
                            </Td>
                            <Td className="max-w-0">
                              <span className="flex items-center gap-2">
                                <span className="deva line-clamp-1">
                                  {row.title}
                                </span>
                                <PriorityChip
                                  priority={row.priority}
                                  locale={locale}
                                />
                              </span>
                            </Td>
                            <Td className="deva hidden whitespace-nowrap lg:table-cell">
                              {row.employeeName ?? "—"}
                            </Td>
                            <Td className="deva hidden whitespace-nowrap xl:table-cell">
                              {departmentOf(row, locale)}
                            </Td>
                            <Td>
                              <span className="flex flex-wrap items-center gap-1">
                                <StatusBadge
                                  status={row.status}
                                  locale={locale}
                                />
                                {row.isOverdue ? (
                                  <OverdueBadge locale={locale} />
                                ) : null}
                              </span>
                            </Td>
                            <Td
                              className={cn(
                                "deva hidden whitespace-nowrap lg:table-cell",
                                !row.assignedToName && "text-text-3",
                              )}
                            >
                              {row.assignedToName ?? "Unassigned"}
                            </Td>
                            <Td className="deva whitespace-nowrap text-text-3">
                              {row.lastPublicUpdateAt
                                ? relativeTime(row.lastPublicUpdateAt, locale)
                                : "—"}
                            </Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  </HScroll>
                </div>
              </ListState>
            </Panel>

            {q.hasNextPage ? (
              <LoadMore
                onClick={() => void q.fetchNextPage()}
                loading={q.isFetchingNextPage}
                label="Load more"
                labelHi="और दिखाएँ"
              />
            ) : null}
          </div>
        </Reveal>
      </div>
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
