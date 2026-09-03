"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  IconBell,
  IconCircleCheck,
  IconClock,
  IconHistory,
  IconInbox,
  IconLoader2,
  IconMoodSmile,
  IconPlus,
} from "@tabler/icons-react";

import { StatusBadge, OverdueBadge } from "@/components/help-slip/badges";
import { KpiStrip, type Kpi } from "@/components/help-slip/kpi-strip";
import { NotificationsPanel } from "@/components/help-slip/notifications-panel";
import {
  CountChip,
  ListState,
  Panel,
  PanelHead,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import { helpSlipGet } from "@/lib/help-slip/api-client";
import { useHelpSlipSession } from "@/lib/help-slip/context";
import {
  departmentOf,
  greetingFor,
  relativeTime,
} from "@/lib/help-slip/format";
import {
  HELP_SLIP_STALE_TIME,
  useUnreadCount,
} from "@/lib/help-slip/use-unread-count";
import {
  KPI_BUCKETS,
  type ConcernRow,
  type EmployeeDashboardPayload,
  type KpiBucket,
} from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The employee's home. It answers ONE question — "did anything happen?" — and
 * makes the four counts tappable so the answer is one click from the list it
 * came from.
 *
 * Written phone-first. Everything desktop is additive: nothing here is a
 * shrunk-down 1440 layout.
 *
 * ── THE SHAPE IS THE ERP DASHBOARD'S ──────────────────────────────────────
 * Three top-level regions, `gap-5` apart, each one `<Reveal>`-staggered in
 * page order: the header, the KPI row, then a panel grid. That is
 * dashboard-view.tsx's own skeleton, and it is what `DashboardFallback`
 * draws while this loads — header block, KPI strip, one card.
 *
 * Nothing floats. The counts are cards, Recent is a panel card with a tinted,
 * ruled head that announces itself with an accent icon chip, and the page
 * ground shows only BETWEEN cards.
 *
 * ── THE PRIMARY CONTROL ───────────────────────────────────────────────────
 * "Raise a concern" is the most important control in the source app. It sits
 * in the greeting row, ahead of the KPIs: somebody who opened this app in
 * order to report something should not have to read four numbers first.
 */
export function EmployeeDashboard() {
  const session = useHelpSlipSession();
  const router = useRouter();

  const q = useQuery({
    queryKey: ["help-slip", "dashboard"],
    queryFn: () =>
      helpSlipGet<EmployeeDashboardPayload>("/api/help-slip/dashboard"),
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const unread = useUnreadCount();
  const data = q.data;
  const error = q.isError ? (q.error as Error).message : null;

  const greeting = greetingFor();
  const firstName = session.fullName.split(" ")[0] ?? "";
  // `departments.name` and nothing else. The `name_hi` column still exists for
  // the legacy app; this module never reads it and never concatenates it.
  const departmentName = data?.departmentName ?? null;

  const goToBucket = (bucket: KpiBucket | "total") =>
    router.push(
      bucket === "total"
        ? "/help-slip/concerns"
        : `/help-slip/concerns?status=${KPI_BUCKETS[bucket].join(",")}`,
    );

  /**
   * Four cards, four CATEGORICAL tones, one real line each.
   *
   * The tone order is fixed and meaningless on purpose — it separates the
   * measures, it does not rank them, and it is not the status palette. Each
   * line plots real filings and always ENDS at the number printed beside it;
   * see src/lib/help-slip/series.ts for exactly what it does and does not say.
   */
  const kpis: Kpi[] = [
    {
      key: "total",
      labelEn: "Total",
      value: data?.kpis.total ?? 0,
      icon: IconInbox,
      tone: "violet",
      series: data?.series.total,
    },
    {
      key: "open",
      labelEn: "Open",
      value: data?.kpis.open ?? 0,
      icon: IconClock,
      tone: "blue",
      series: data?.series.open,
    },
    {
      key: "inProgress",
      labelEn: "In Progress",
      value: data?.kpis.inProgress ?? 0,
      icon: IconLoader2,
      tone: "amber",
      series: data?.series.inProgress,
    },
    {
      key: "resolved",
      labelEn: "Resolved",
      value: data?.kpis.resolved ?? 0,
      icon: IconCircleCheck,
      tone: "green",
      series: data?.series.resolved,
    },
  ];

  return (
    // The ERP page root: a vertical rhythm and nothing else. The scroll
    // container and the page padding come from `(app)/layout.tsx`, and `gap-5`
    // is the seam every Order Entry screen puts between its regions.
    <div className="flex flex-col gap-5">
      {/* ─── 1. the greeting, and nothing else ──────────────────────────── */}
      <Reveal index={0}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 md:flex-1">
            <h1 className={cn("text-text-1", T.h1)}>
              {greeting.en}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className={cn("mt-1 text-text-3", T.body)}>
              Here&apos;s an overview of your concerns
              {departmentName ? ` · ${departmentName}` : ""}
            </p>
          </div>

          {/* Full width on a phone. The wrapper used to inherit that from a
              `flex-col` parent; once the header became `flex-wrap` it had to
              be said out loud, or the one primary action on the screen shrinks
              to its text on the device most people file from. */}
          <div className="flex w-full shrink-0 items-center gap-2 md:w-auto">
            {/* THE control.
                44px + 16px text below md: the minimum touch target for a phone
                held on the factory floor, and anything under 16px makes iOS
                Safari auto-zoom on focus and never zoom back out. ERP-compact
                (36px / 13px) from md up. */}
            <Button
              size="lg"
              className="h-11 flex-1 px-5 text-base md:h-9 md:flex-none md:px-3 md:text-sm"
              nativeButton={false}
              render={<Link href="/help-slip/concerns/new" />}
            >
              <IconPlus className="size-5 md:size-4" stroke={1.8} aria-hidden />
              Raise a concern
            </Button>

            {/* A quiet square, deliberately NOT a primary button. It
                duplicates the notification centre one click away, which is
                defensible: the sidebar entry is navigation, this is the unread
                STATE where the eye already is.
                36×36 with an 8px radius, not a 48px circle — docs/DESIGN.md:
                the ERP's icon buttons are squares (crm/followup-queue.tsx's
                Refresh is the same string). Desktop-only, so no touch guard. */}
            <Link
              href="/help-slip/notifications"
              aria-label={
                unread > 0
                  ? `Notifications (${unread} unread)`
                  : "Notifications"
              }
              className="relative hidden size-9 shrink-0 place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text-1 md:grid"
            >
              <IconBell className="size-4" stroke={1.6} aria-hidden />
              {unread > 0 ? (
                // A DOT, not a count. The number lives on the notification
                // centre a click away, and two badges disagreeing by one after
                // a refetch is a bug report waiting to happen.
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-surface"
                />
              ) : null}
            </Link>
          </div>
        </div>
      </Reveal>

      {/* ─── 2. the four counts ─────────────────────────────────────────── */}
      <Reveal index={1}>
        <KpiStrip
          items={kpis}
          loading={q.isPending}
          error={q.isError}
          errorLabel="Failed to load"
          onSelect={(key) => goToBucket(key as KpiBucket | "total")}
        />
      </Reveal>

      {/* ─── 3. Recent, with Notifications beside it ──────────────────── *
       * `gap-3.5` is the ERP's dashboard panel-grid gap. A FIXED 20rem rail
       * and everything else to the table: a 2fr/1fr split gives the
       * notifications panel 600px of one-line entries on a wide monitor while
       * the table — the thing with content in it — gets squeezed.
       * `items-start` so the shorter of the two does not stretch to match the
       * taller.                                                             */}
      <Reveal index={2}>
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <Panel>
            {/* A card that announces itself: accent icon chip, heading, an
                inline note beside it, and the count + "View all" in the right
                slot. A bare heading over a table is the old screen. */}
            <PanelHead
              titleEn="Recent"
              icon={<IconHistory />}
              note="Newest first"
              aside={
                <div className="flex items-center gap-2.5">
                  {/* Only once the payload is real: a "0" chip beside a
                      spinner is a count of nothing, not a count of zero. */}
                  {data ? <CountChip>{data.recent.length}</CountChip> : null}
                  {/* A 12.5px link is a 19px tap target. It keeps its drawn
                      size — it sits on a heading line — and buys the 44px
                      below `md` from a transparent overlay, which is dropped
                      from `md` up where a pointer is doing the aiming. */}
                  <Link
                    href="/help-slip/concerns"
                    className={cn(
                      "relative text-accent-text before:absolute before:-inset-3.5 before:content-[''] hover:underline md:before:hidden",
                      T.bodySm,
                    )}
                  >
                    View all
                  </Link>
                </div>
              }
            />

            <ListState
              loading={q.isPending}
              error={error}
              onRetry={() => void q.refetch()}
              isEmpty={(data?.recent.length ?? 0) === 0}
              empty={{
                icon: IconMoodSmile,
                titleEn: "You're all clear.",
                bodyEn: "No open concerns right now.",
              }}
            >
              <RecentConcerns rows={data?.recent ?? []} />
            </ListState>
          </Panel>

          {/* Below 1280 the notification centre is one click away in the
              sidebar, and the vertical space is worth more than the
              duplication. */}
          <aside className="hidden xl:block">
            <NotificationsPanel
              items={data?.notifications ?? []}
              loading={q.isPending}
              error={error}
              onRetry={() => void q.refetch()}
            />
          </aside>
        </div>
      </Reveal>
    </div>
  );
}

/**
 * One list, two renderings: cards below 768, a real table above it. Never a
 * fork — the same rows, the same order, the same components inside the cells.
 */
function RecentConcerns({ rows }: { rows: ConcernRow[] }) {
  return (
    <>
      {/* ── cards, < 768 ───────────────────────────────────────────────── *
       * A GRID, not a column: one-up on a phone, two-up from `sm`, which is
       * the ERP's own `grid gap-2 sm:grid-cols-2` for a row of small record
       * cards (dashboard-view's "Needs attention"). Single column below `sm`
       * is the mobile guard and is not negotiable.                          */}
      <ul className="grid gap-2.5 p-3 sm:grid-cols-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            {/* The whole card is the link — a real one, so back, new-tab and
                the keyboard all work.
                The ERP's mobile row card (orders-dashboard.tsx's OrderCard):
                bg-surface + shadow-sm + a border that strengthens on hover and
                a press scale. `Panel` no longer ships shadow-sm, so a card that
                really IS a press target says so itself. */}
            <Link
              href={`/help-slip/concerns/${row.id}`}
              className="flex h-full flex-col rounded-card border border-border bg-surface p-3 shadow-sm transition-colors outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[.99]"
            >
              {/* Identity row: the ID over the title on the left, the status
                  hard right — OrderCard's `flex items-start justify-between`. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={cn("num block text-text-3", T.caption)}>
                    {row.concernNumber}
                  </span>
                  {/* 2-line clamp: a long title must not push the meta row off
                      the card on a 360px screen. */}
                  <p className={cn("line-clamp-2 text-text-1", T.h3)}>
                    {row.title}
                  </p>
                </div>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <StatusBadge status={row.status} />
                  {row.isOverdue ? <OverdueBadge /> : null}
                </span>
              </div>

              {/* Meta row: the ERP's `mt-2 flex flex-wrap … gap-x-3 gap-y-1`,
                  with `ml-auto` pushing the age to the right edge the way
                  OrderCard pushes the money. */}
              <div
                className={cn(
                  "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-3",
                  T.caption,
                )}
              >
                <span className="min-w-0 truncate">
                  {departmentOf(row)}
                </span>
                <span className="num ml-auto">
                  {relativeTime(row.lastPublicUpdateAt ?? row.createdAt)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── table, ≥ 768 ───────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <HScroll bodyClassName="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th>ID</Th>
                {/* The Slack rule (data-table.tsx): exactly ONE column takes
                    w-full and absorbs the slack. Title is the column that
                    genuinely varies — never a .num column, whose right-aligned
                    figures would end up miles from their header. */}
                <Th className="w-full">Title</Th>
                <Th className="hidden lg:table-cell">Department</Th>
                <Th>Updated</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                // `relative`, so the ID cell's link can cover the whole row.
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
                  <Td className="max-w-0">
                    <span className="line-clamp-1">{row.title}</span>
                  </Td>
                  <Td className="hidden whitespace-nowrap lg:table-cell">
                    {departmentOf(row)}
                  </Td>
                  {/* A date is a figure: `.num`, never a proportional face. */}
                  <Td className="num whitespace-nowrap text-text-3">
                    {relativeTime(row.lastPublicUpdateAt ?? row.createdAt)}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={row.status} />
                      {row.isOverdue ? <OverdueBadge /> : null}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </HScroll>
      </div>
    </>
  );
}
