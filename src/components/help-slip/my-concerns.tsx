"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  IconArrowRight,
  IconMoodSmile,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";

import { OverdueBadge, StatusBadge } from "@/components/help-slip/badges";
import { Bi } from "@/components/help-slip/bilingual";
import {
  CheckRow,
  DateRangeFields,
  FilterGroup,
  FilterSheet,
  StatusPills,
  ALL_STATUSES,
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
import { Button } from "@/components/ui/button";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import type { ConcernStatus } from "@/db/help-slip/schema";
import { helpSlipGet } from "@/lib/help-slip/api-client";
import { useHelpSlipLocale } from "@/lib/help-slip/context";
import { departmentOf, relativeTime } from "@/lib/help-slip/format";
import { STATUS_META } from "@/lib/help-slip/meta";
import { useDebouncedValue } from "@/lib/help-slip/use-debounced-value";
import { HELP_SLIP_STALE_TIME } from "@/lib/help-slip/use-unread-count";
import {
  CONCERN_SORTS,
  DEFAULT_CONCERN_FILTERS,
  LIST_TABS,
  activeConcernFilterCount,
  hasConcernFilter,
  parseDateParam,
  parseDirection,
  parseSort,
  parseStatusParam,
  tabForStatuses,
  type ConcernFilters,
  type ConcernListPayload,
  type ConcernSort,
  type ListTab,
} from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * My concerns — the employee's own list.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  EVERYTHING THE READER CAN CHANGE LIVES IN THE URL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Search, status, dates, sort — all of it, and nowhere else. That single
 * decision is what makes coming back from a concern work: the URL puts the
 * filters back, and no component holds state that has to be re-synchronised
 * with it.
 *
 * Writes REPLACE rather than push. Every keystroke pushing a history entry
 * would turn one back-tap into fifteen and strand the reader on this screen;
 * the filters still survive back FROM a detail page, because navigating away
 * pushes a real entry carrying whatever the URL held at that moment.
 *
 * Page size 20, and "Load more" — never infinite scroll. See `LoadMore`.
 */
export function MyConcerns() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useHelpSlipLocale();

  const filters = React.useMemo(
    () => filtersFromParams(params),
    [params],
  );

  const apply = React.useCallback(
    (next: ConcernFilters) => {
      router.replace(`/help-slip/concerns?${paramsFromFilters(next)}`, {
        scroll: false,
      });
    },
    [router],
  );

  // ── search: local state, debounced into the URL ────────────────────────
  const [term, setTerm] = React.useState(filters.search);
  const debounced = useDebouncedValue(term, 300);

  // The URL is the source of truth, so a back navigation or a Clear press has
  // to be able to overwrite what is in the box.
  React.useEffect(() => {
    setTerm(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    if (debounced !== filters.search) {
      apply({ ...filters, search: debounced });
    }
    // `filters` is derived from the URL, and including it would re-fire this
    // on every unrelated filter change and fight the write it just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const qs = paramsFromFilters(filters);

  const q = useInfiniteQuery({
    queryKey: ["help-slip", "concerns", qs],
    queryFn: ({ pageParam }) =>
      helpSlipGet<ConcernListPayload>(
        `/api/help-slip/concerns?${qs}&page=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
    // Dimmed, not blanked, while a filter change is in flight. Replacing rows
    // with a skeleton on every keystroke reads as the screen breaking rather
    // than as it working.
    placeholderData: (prev) => prev,
  });

  const rows = React.useMemo(
    () => q.data?.pages.flatMap((p) => p.rows) ?? [],
    [q.data],
  );
  const total = q.data?.pages[0]?.total ?? 0;
  const filtered = hasConcernFilter(filters);
  const tab = tabForStatuses(filters.status);

  // ── the sheet edits a DRAFT, applied on Apply ──────────────────────────
  const [draft, setDraft] = React.useState<ConcernFilters>(filters);

  const clearAll = () => {
    setTerm("");
    apply(DEFAULT_CONCERN_FILTERS);
  };

  const sortBy = (key: ConcernSort) =>
    apply({
      ...filters,
      sort: key,
      direction:
        filters.sort === key && filters.direction === "desc" ? "asc" : "desc",
    });

  const th = (key: ConcernSort, label: string) => (
    <SortHeader
      label={label}
      active={filters.sort === key}
      direction={filters.direction}
      onSort={() => sortBy(key)}
    />
  );

  return (
    <div className="flex flex-col">
      <Reveal index={0}>
        <PageHeader
          titleEn="My concerns"
          titleHi="मेरी शिकायतें"
          subtitle={
            <Bi
              en="Everything you have raised, newest first."
              hi="आपकी दर्ज की गई सभी शिकायतें, नई पहले।"
            />
          }
          meta={total > 0 ? `Showing ${rows.length} of ${total}` : null}
          actions={
            // The primary control of the whole module, on the screen somebody
            // lands on when they came here to report something. 44px, because
            // this is the one button that gets pressed standing up.
            <Button
              size="lg"
              className="h-11 px-5 text-base"
              render={<Link href="/help-slip/concerns/new" />}
            >
              <IconPlus className="size-5" stroke={1.8} aria-hidden />
              <Bi en="Raise a concern" hi="शिकायत दर्ज करें" />
            </Button>
          }
        />
      </Reveal>

      {/* 40px between the controls and the list — two distinct sections
          ("narrow it" and "here it is"). The tighter 12px cluster rhythm still
          applies WITHIN each. */}
      <div className="flex flex-col gap-10 pb-10">
        {/* ═══ controls ═══════════════════════════════════════════════ */}
        <Reveal index={1}>
          <div className="flex flex-col gap-3">
            {/* Search keeps its own row: it is flex-1, so anything sharing a
                wrapping row with it would squeeze it to nothing at 360px. */}
            <div className="flex items-center gap-2">
              <SearchField
                value={term}
                onChange={setTerm}
                label="Search your concerns"
                placeholder="Search by number or words"
              />

              <div className="md:hidden">
                <FilterSheet
                  activeCount={activeConcernFilterCount(filters)}
                  onOpen={() => setDraft(filters)}
                  onApply={() => apply(draft)}
                  onReset={() =>
                    setDraft({
                      ...DEFAULT_CONCERN_FILTERS,
                      search: draft.search,
                    })
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
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Quick filter, phone only. Three options that PARTITION the
                  statuses, so "All" really is the union of the other two. */}
              <Segmented<ListTab | "custom">
                value={tab ?? "custom"}
                onChange={(next) => {
                  if (next === "custom") return;
                  apply({ ...filters, status: [...LIST_TABS[next]] });
                }}
                label="Status"
                options={[
                  { value: "all", label: "All" },
                  { value: "open", label: "Open" },
                  { value: "resolved", label: "Resolved" },
                ]}
                className="md:hidden"
              />

              {/* From 768 the same two dimensions sit inline above the table. */}
              <div className="hidden flex-wrap items-center gap-3 md:flex">
                <StatusPills
                  value={filters.status}
                  onChange={(status) => apply({ ...filters, status })}
                  locale={locale}
                />
                <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
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
                        icon: IconMoodSmile,
                        titleEn: "You're all clear.",
                        titleHi: "सब ठीक है।",
                        bodyEn: "No open concerns right now.",
                        bodyHi: "अभी कोई शिकायत नहीं है।",
                        // An empty list is the other place somebody arrives
                        // wanting to file something — and the one place the
                        // header CTA is furthest from the eye.
                        action: {
                          label: "Raise a concern",
                          onClick: () => router.push("/help-slip/concerns/new"),
                        },
                      }
                }
              >
                {/* ── cards, < 768 ──────────────────────────────────── */}
                <ul className="flex flex-col gap-3 p-3 md:hidden">
                  {rows.map((row) => (
                    <li key={row.id}>
                      {/* The WHOLE CARD is the link, not a tap target inside
                          it. A real <Link>, so back works, the row can be
                          opened in a new tab, and a keyboard reaches it —
                          none of which an onClick handler gives. */}
                      <Link
                        href={`/help-slip/concerns/${row.id}`}
                        className="flex flex-col gap-2 rounded-card border border-border p-3 transition-colors outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/40"
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
                        {departmentOf(row, locale)}
                        {" · "}
                        {relativeTime(row.createdAt, locale)}
                      </p>

                      {/* The last public update, arrow-prefixed. It is the
                          answer to the only question this screen is really
                          asked: did anything happen? */}
                      <p
                        className={cn(
                          "deva flex items-start gap-1 text-text-2",
                          T.caption,
                        )}
                      >
                        <IconArrowRight
                          className="mt-0.5 size-3.5 shrink-0 text-text-3"
                          stroke={1.6}
                          aria-hidden
                        />
                        <span className="line-clamp-1">
                          {row.lastPublicUpdateAt ? (
                            relativeTime(row.lastPublicUpdateAt, locale)
                          ) : (
                            <Bi
                              en="No update yet"
                              hi="अभी कोई अपडेट नहीं"
                            />
                          )}
                        </span>
                      </p>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/* ── table, ≥ 768 ──────────────────────────────────── */}
                <div className="hidden md:block">
                  <HScroll bodyClassName="overflow-x-auto">
                    <Table>
                      <THead>
                        <tr>
                          <Th>{th("concern_number", "ID")}</Th>
                          {/* The one w-full column — see data-table.tsx. */}
                          <Th className="w-full">{th("title", "Title")}</Th>
                          <Th className="hidden lg:table-cell">
                            {th("department_name", "Department")}
                          </Th>
                          <Th>{th("status", "Status")}</Th>
                          <Th className="hidden xl:table-cell">
                            {th("created_at", "Created")}
                          </Th>
                          <Th>
                            {th("last_public_update_at", "Last update")}
                          </Th>
                        </tr>
                      </THead>
                      <TBody>
                        {rows.map((row) => (
                          // `relative`, so the ID cell's link can cover the
                          // whole row with a pseudo-element. That keeps ONE
                          // real <Link> per row — back, new-tab and keyboard
                          // all work — while the entire row is the target,
                          // which an onClick on <Tr> would not give.
                          <Tr key={row.id} className="relative">
                            <Td className="num whitespace-nowrap">
                              <Link
                                href={`/help-slip/concerns/${row.id}`}
                                aria-label={`${row.concernNumber}: ${row.title}`}
                                className="rounded-field outline-none after:absolute after:inset-0 after:content-[''] hover:text-accent-text focus-visible:text-accent-text focus-visible:underline"
                              >
                                {row.concernNumber}
                              </Link>
                            </Td>
                            <Td className="deva max-w-0">
                              <span className="line-clamp-1">{row.title}</span>
                            </Td>
                            <Td className="deva hidden whitespace-nowrap lg:table-cell">
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
                            <Td className="deva hidden whitespace-nowrap text-text-3 xl:table-cell">
                              {relativeTime(row.createdAt, locale)}
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

function filtersFromParams(p: URLSearchParams): ConcernFilters {
  return {
    search: p.get("q") ?? "",
    status: parseStatusParam(p.get("status")),
    from: parseDateParam(p.get("from")),
    to: parseDateParam(p.get("to")),
    sort: parseSort(p.get("sort"), CONCERN_SORTS, DEFAULT_CONCERN_FILTERS.sort),
    direction: parseDirection(p.get("dir")),
  };
}

/**
 * Only NON-DEFAULT values are written. A URL that spells out every default is
 * unreadable, unshareable, and makes "is this list filtered?" a question you
 * have to parse a query string to answer.
 */
function paramsFromFilters(f: ConcernFilters): string {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.status.length > 0) p.set("status", (f.status as ConcernStatus[]).join(","));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.sort !== DEFAULT_CONCERN_FILTERS.sort) p.set("sort", f.sort);
  if (f.direction !== DEFAULT_CONCERN_FILTERS.direction) p.set("dir", f.direction);
  return p.toString();
}
