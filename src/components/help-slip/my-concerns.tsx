"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  IconArrowRight,
  IconListDetails,
  IconMoodSmile,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";

import { OverdueBadge, StatusBadge } from "@/components/help-slip/badges";
import {
  CheckRow,
  DateRangeFields,
  FilterGroup,
  FilterSheet,
  StatusPills,
  ALL_STATUSES,
  FILTER_TOOLBAR,
} from "@/components/help-slip/filters";
import {
  ListState,
  LoadMore,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  SortHeader,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import type { ConcernStatus } from "@/db/help-slip/schema";
import { helpSlipGet } from "@/lib/help-slip/api-client";
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
 *
 * ── THE SHAPE IS THE ERP LIST SCREEN ──────────────────────────────────────
 * Header → carded toolbar → one panel card holding the table (or the row
 * cards below `lg`) and its footer. Nothing floats: the page ground is only
 * ever visible BETWEEN cards, which is the whole of the complaint this
 * module was rebuilt to answer.
 */
export function MyConcerns() {
  const router = useRouter();
  const params = useSearchParams();

  const filters = React.useMemo(() => filtersFromParams(params), [params]);

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
    // The ERP page root: a vertical rhythm and nothing else. `(app)/layout`
    // already supplies the padding, and `PageHeader` carries none of its own,
    // so the 20px seam between the title and the first card is this gap.
    <div className="flex flex-col gap-5">
      <Reveal index={0}>
        <PageHeader
          titleEn="My concerns"
          subtitle="Everything you have raised, newest first."
          meta={total > 0 ? `Showing ${rows.length} of ${total}` : null}
          actions={
            // The primary control of the whole module, on the screen somebody
            // lands on when they came here to report something. 44px + 16px
            // text below md: the minimum touch target for a phone held on the
            // factory floor, which is where this button gets pressed, standing
            // up. ERP-compact (36px / 14px) from md up — the page-header CTA
            // in Order Entry and CRM.
            <Button
              size="lg"
              className="h-11 px-5 text-base md:h-9 md:px-3 md:text-sm"
              nativeButton={false}
              render={<Link href="/help-slip/concerns/new" />}
            >
              <IconPlus className="size-5 md:size-4" stroke={1.8} aria-hidden />
              Raise a concern
            </Button>
          }
        />
      </Reveal>

      {/* ═══ toolbar ════════════════════════════════════════════════ */}
      <Reveal index={1}>
        {/* THE TOOLBAR IS A CARD. A bare row of controls standing next to
            carded content is the "floating on the page background" tell, and
            `ListFallback` already draws a carded toolbar skeleton — a bare
            row here would also mean the page changes shape the moment the
            data lands. */}
        <div className={FILTER_TOOLBAR}>
          {/* Search takes a whole line below md: it is flex-1, so anything
              else wrapping onto its row would squeeze it to nothing at 360px.
              The Filters trigger is the one thing that shares it, because it
              is shrink-0 and 44px wide either way. */}
          <div className="flex w-full items-center gap-2 md:w-auto md:flex-1">
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

                <FilterGroup labelEn="Filed between">
                  <DateRangeFields
                    from={draft.from}
                    to={draft.to}
                    onChange={(range) => setDraft({ ...draft, ...range })}
                  />
                </FilterGroup>
              </FilterSheet>
            </div>
          </div>

          {/* Quick filter, phone only. Three options that PARTITION the
              statuses, so "All" really is the union of the other two.
              `[&_button]:h-11` is the mobile guard: `Segmented`'s own `md`
              geometry is 32px, and this control only ever renders below md,
              where 44px is the floor. */}
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
            className="[&_button]:h-11 md:hidden"
          />

          {/* From 768 the same two dimensions sit inline in the toolbar. */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <StatusPills
              value={filters.status}
              onChange={(status) => apply({ ...filters, status })}
            />
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <DateRangeFields
              from={filters.from}
              to={filters.to}
              onChange={(range) => apply({ ...filters, ...range })}
              labelFrom="Filed from"
              labelTo="Filed to"
            />
          </div>

          {filtered ? (
            // `min-h-11` below md buys the 44px touch target a text link does
            // not have on its own; from md up it is the ERP's inline link.
            <button
              type="button"
              onClick={clearAll}
              className={cn(
                "ml-auto inline-flex min-h-11 cursor-pointer items-center text-accent-text underline underline-offset-2 md:min-h-0",
                T.bodySm,
              )}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </Reveal>

      {/* ═══ the list ═══════════════════════════════════════════════ */}
      <Reveal index={2}>
        <Panel
          className={cn(
            "transition-opacity",
            q.isFetching && !q.isFetchingNextPage && !q.isPending
              ? "opacity-60"
              : null,
          )}
        >
          {/* Every card announces itself: an accent icon chip, a heading, and
              a right-hand slot. A filtered list that does not SAY it is
              filtered is how somebody concludes their concern vanished — the
              Clear link in the toolbar is the way back out. */}
          <PanelHead
            titleEn="Concerns"
            icon={<IconListDetails />}
            aside={filtered ? <Eyebrow>Filtered</Eyebrow> : null}
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
                    icon: IconMoodSmile,
                    titleEn: "You're all clear.",
                    bodyEn: "No open concerns right now.",
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
            {/* ── row cards, below lg ───────────────────────────── */}
            <ul className="flex flex-col gap-2.5 p-3 lg:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  {/* The WHOLE CARD is the link, not a tap target inside
                      it. A real <Link>, so back works, the row can be
                      opened in a new tab, and a keyboard reaches it —
                      none of which an onClick handler gives.

                      Order Entry's mobile row card, verbatim
                      (`orders/orders-dashboard.tsx`'s OrderCard): surface
                      ground, border-strong on hover, and a press scale. It
                      carries its own `shadow-sm` because `Panel` does not —
                      a shadow marks a press TARGET here, not a container. */}
                  <Link
                    href={`/help-slip/concerns/${row.id}`}
                    className="block w-full rounded-card border border-border bg-surface p-3 text-left shadow-sm transition-colors outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[.99]"
                  >
                    {/* Identity block left, status hard right. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span
                          className={cn("num block text-text-3", T.caption)}
                        >
                          {row.concernNumber}
                        </span>
                        <span
                          className={cn(
                            "line-clamp-2 font-semibold text-text-1",
                            T.body,
                          )}
                        >
                          {row.title}
                        </span>
                      </div>
                      <span className="flex shrink-0 items-center gap-1">
                        <StatusBadge status={row.status} />
                        {row.isOverdue ? <OverdueBadge /> : null}
                      </span>
                    </div>

                    {/* The meta row, its last item pushed right with
                        `ml-auto`: the last public update is the answer to
                        the only question this screen is really asked — did
                        anything happen? */}
                    <div
                      className={cn(
                        "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-3",
                        T.caption,
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {departmentOf(row)}
                      </span>
                      <span className="num">{relativeTime(row.createdAt)}</span>
                      <span className="ml-auto flex min-w-0 items-center gap-1 text-text-2">
                        <IconArrowRight
                          className="size-3 shrink-0 text-text-3"
                          stroke={1.6}
                          aria-hidden
                        />
                        {row.lastPublicUpdateAt ? (
                          <span className="num truncate">
                            {relativeTime(row.lastPublicUpdateAt)}
                          </span>
                        ) : (
                          <span className="truncate">No update yet</span>
                        )}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* ── table, lg and up ──────────────────────────────── */}
            {/* The bounded body is what makes `THead`'s sticky top-0 do
                anything: the header stays put while the rows scroll under
                it, and `HScroll` puts a second horizontal scrollbar ABOVE
                the header, where the columns actually are. */}
            <div className="hidden lg:block">
              <HScroll bodyClassName="max-h-[calc(100vh-19rem)] overflow-auto">
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
                      <Th>{th("last_public_update_at", "Last update")}</Th>
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
                        <Td className="num font-medium whitespace-nowrap">
                          <Link
                            href={`/help-slip/concerns/${row.id}`}
                            aria-label={`${row.concernNumber}: ${row.title}`}
                            className="rounded-field outline-none after:absolute after:inset-0 after:content-[''] hover:text-accent-text focus-visible:text-accent-text focus-visible:underline"
                          >
                            {row.concernNumber}
                          </Link>
                        </Td>
                        <Td className="max-w-0 text-text-1">
                          <span className="line-clamp-1">{row.title}</span>
                        </Td>
                        <Td className="hidden whitespace-nowrap text-text-2 lg:table-cell">
                          {departmentOf(row)}
                        </Td>
                        <Td>
                          <span className="flex flex-wrap items-center gap-1">
                            <StatusBadge status={row.status} />
                            {row.isOverdue ? <OverdueBadge /> : null}
                          </span>
                        </Td>
                        <Td className="num hidden whitespace-nowrap text-text-3 xl:table-cell">
                          {relativeTime(row.createdAt)}
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

          {/* The card's own footer rule, the ERP's pagination slot. "Load
              more" sits OUTSIDE the table's bounded scroll body, so it stays
              reachable however far down the rows the reader is. */}
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
  if (f.status.length > 0)
    p.set("status", (f.status as ConcernStatus[]).join(","));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.sort !== DEFAULT_CONCERN_FILTERS.sort) p.set("sort", f.sort);
  if (f.direction !== DEFAULT_CONCERN_FILTERS.direction)
    p.set("dir", f.direction);
  return p.toString();
}
