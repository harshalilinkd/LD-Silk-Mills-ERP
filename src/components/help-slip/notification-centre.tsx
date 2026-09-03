"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  IconBell,
  IconCalendarEvent,
  IconChecks,
  IconHistory,
} from "@tabler/icons-react";

import {
  CountChip,
  ListState,
  LoadMore,
  PageHeader,
  Panel,
  PanelHead,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Spinner } from "@/components/ui/spinner";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { useHelpSlipSession } from "@/lib/help-slip/context";
import { isToday, relativeTime } from "@/lib/help-slip/format";
import { HELP_SLIP_STALE_TIME } from "@/lib/help-slip/use-unread-count";
import type {
  NotificationRow,
  NotificationsPayload,
} from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The notification centre.
 *
 * Two groups, Today and Earlier, and nothing finer. A notification is read in
 * the first minute or not at all — a full date breakdown would be a filing
 * system for something nobody files.
 *
 * ── ONE LIST CARD, GROUPS ANNOUNCED INSIDE IT ─────────────────────────────
 * The feed is a single ERP panel card, and every state of the screen is a face
 * of that card: the rows, the spinner, the error, the empty. Nothing sits on
 * the page ground — the ground is only ever visible BETWEEN cards, and a
 * spinner or a lone "Nothing new" bell floating under the title is the loudest
 * tell that a screen was not built in this system. `ListState` draws its
 * states at the ERP's in-card block padding for exactly this reason.
 *
 * Each day group carries the ERP's tinted head strip — accent icon chip,
 * heading, count — because a bare day label above a run of rows reads as a
 * heading somebody left behind rather than as the top of a group.
 *
 * ── "MARK ALL READ" IS A DECISION ─────────────────────────────────────────
 * It is not something that happens TO the reader on arrival. The standalone
 * app used to auto-clear on visiting this route, which destroyed the unread
 * styling before anyone had read a row — the exact thing they came here for.
 * So: tapping a row, or pressing the button. The button appears ONLY when it
 * would do something; a permanently visible action that is usually a no-op
 * teaches people to ignore it.
 *
 * ── UNREAD IS NEVER COLOUR ALONE ──────────────────────────────────────────
 * A brand left border AND a heavier title. Around 8% of the factory cannot
 * tell two rows apart if a tint is the only difference — and a bare dot is
 * worse still, because it is one 6px mark competing with a whole row of text.
 * Both marks are tokens — `border-l-primary` and a font weight — so both
 * survive the theme flip; a wash tuned for one theme would not.
 */
export function NotificationCentre() {
  const session = useHelpSlipSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Same rule as `isStaff()` on the server, so a notification cannot land a
  // coordinator on the employee's read-only view of a concern they are meant
  // to be working. It decides a URL and nothing else.
  const staff = session.role === "pc" || session.role === "admin";

  const q = useInfiniteQuery({
    queryKey: ["help-slip", "notifications"],
    queryFn: ({ pageParam }) =>
      helpSlipGet<NotificationsPayload>(
        `/api/help-slip/notifications${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.hasMore
        ? (last.items[last.items.length - 1]?.createdAt ?? undefined)
        : undefined,
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const items = React.useMemo(
    () => q.data?.pages.flatMap((p) => p.items) ?? [],
    [q.data],
  );
  const unreadShown = items.filter((n) => !n.readAt).length;

  /**
   * Marking read is OPTIMISTIC.
   *
   * Tapping a notification also NAVIGATES, so the row is on screen for about
   * one frame. Waiting for a round trip means the bold title and the brand
   * edge are still there as the screen leaves and gone when the reader comes
   * back — which reads as the tap having done nothing until it mysteriously
   * did.
   *
   * The cache is an infinite query, so the write walks pages rather than
   * replacing a list, and `onError` restores the exact previous snapshot: a
   * rollback that recomputed would drop any row that arrived in between.
   */
  const key = ["help-slip", "notifications"];

  const patchCache = (fn: (n: NotificationRow) => NotificationRow) => {
    queryClient.setQueryData<{
      pages: NotificationsPayload[];
      pageParams: unknown[];
    }>(key, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map(fn),
            })),
          }
        : current,
    );
  };

  const beginOptimistic = async (
    fn: (n: NotificationRow) => NotificationRow,
  ) => {
    // Without this an in-flight refetch can land after the optimistic write
    // and overwrite it with the pre-update server state.
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData(key);
    patchCache(fn);
    return { previous };
  };

  const rollback = (context: { previous: unknown } | undefined) => {
    if (context) queryClient.setQueryData(key, context.previous);
  };

  // Settled, not success: a rollback still has to re-sync the bell, which
  // reads a different key.
  const resyncUnread = () => {
    void queryClient.invalidateQueries({ queryKey: ["help-slip", "unread"] });
  };

  const stamp = () => new Date().toISOString();

  const markRead = useMutation({
    mutationFn: (id: string) =>
      helpSlipSend<{ unread: number }>(
        "/api/help-slip/notifications",
        "PATCH",
        { id },
      ),
    onMutate: (id: string) =>
      beginOptimistic((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? stamp() } : n,
      ),
    onError: (_e, _id, context) => rollback(context),
    onSettled: resyncUnread,
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      helpSlipSend<{ unread: number }>(
        "/api/help-slip/notifications",
        "PATCH",
        { all: true },
      ),
    onMutate: () =>
      beginOptimistic((n) => (n.readAt ? n : { ...n, readAt: stamp() })),
    onError: (_e, _vars, context) => rollback(context),
    onSettled: resyncUnread,
  });

  /**
   * Read, THEN navigate — in that order and not the other way round.
   *
   * WHERE it lands depends on who is reading. A coordinator wants the
   * workspace (the screen they can act from); an employee wants their own
   * view of their own concern. `role` is a RENDERING hint and nothing more —
   * an employee who somehow reached the workspace URL gets told to use their
   * own view, and RLS would have refused the writes regardless.
   *
   * `?u=` names the timeline row the notification was about, which
   * `<Timeline targetId>` scrolls to and marks. Without it three
   * notifications read a day apart all drop the reader on the same bottom
   * node, which teaches people the links do not work.
   *
   * The one kind with nowhere on a concern to land is `access_requested`: it
   * announces a sign-in request, not a concern, and carries no `concernId`.
   * Until the admin screens are ported it stays on this page rather than
   * falling through to a no-op that looks like a broken link.
   */
  const open = (n: NotificationRow) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (!n.concernId) return;
    const base = staff
      ? `/help-slip/all/${n.concernId}`
      : `/help-slip/concerns/${n.concernId}`;
    router.push(n.concernUpdateId ? `${base}?u=${n.concernUpdateId}` : base);
  };

  const { today, earlier } = splitByDay(items);

  return (
    // The ERP page rhythm — `flex flex-col gap-5` between the h1 and the
    // regions under it, on every page file under order-entry/. `PageHeader`
    // owns no padding of its own, so the seam belongs to the root.
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 pb-6">
      <Reveal index={0}>
        <PageHeader
          titleEn="Notifications"
          subtitle="Updates on your concerns."
          actions={
            // Only when it would DO something.
            unreadShown > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                // 44px below md: the minimum touch target for a phone held on
                // the factory floor. ERP-compact (36px) from md up.
                className="h-11 md:h-9"
              >
                {markAllRead.isPending ? (
                  <Spinner />
                ) : (
                  <IconChecks
                    className="size-5 md:size-4"
                    stroke={1.6}
                    aria-hidden
                  />
                )}
                Mark all read
              </Button>
            ) : null
          }
        />
      </Reveal>

      <Reveal index={1}>
        <Panel>
          <ListState
            loading={q.isPending}
            error={q.isError ? (q.error as Error).message : null}
            onRetry={() => void q.refetch()}
            isEmpty={items.length === 0}
            empty={{
              icon: IconBell,
              titleEn: "Nothing new.",
              bodyEn:
                "When a coordinator answers one of your concerns, you'll hear about it here.",
            }}
          >
            <div
              className={cn(
                "flex flex-col transition-opacity",
                q.isFetching && !q.isFetchingNextPage && !q.isPending
                  ? "opacity-60"
                  : null,
              )}
            >
              {today.length > 0 ? (
                <Group
                  label="Today"
                  icon={<IconCalendarEvent />}
                  items={today}
                  onOpen={open}
                />
              ) : null}
              {earlier.length > 0 ? (
                <Group
                  label="Earlier"
                  icon={<IconHistory />}
                  items={earlier}
                  onOpen={open}
                />
              ) : null}
            </div>
          </ListState>

          {q.hasNextPage ? (
            // The ERP puts its pager INSIDE the list card, on a solid top rule,
            // never adrift beneath it.
            <div className="border-t border-border px-4 sm:px-5">
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

/**
 * One day group: the ERP's tinted head strip over its rows.
 *
 * `border-t` on every group but the first is the seam between two groups
 * sharing one card — the strip already draws its own bottom rule, so the top
 * one is the only thing missing.
 */
function Group({
  label,
  icon,
  items,
  onOpen,
}: {
  label: string;
  icon: React.ReactNode;
  items: NotificationRow[];
  onOpen: (n: NotificationRow) => void;
}) {
  return (
    <section className="border-t border-border first:border-t-0">
      <PanelHead
        titleEn={label}
        icon={icon}
        aside={<CountChip>{items.length}</CountChip>}
      />
      <ul className="flex flex-col">
        {items.map((n) => (
          <li key={n.id} className="border-b border-border last:border-0">
            <button
              type="button"
              onClick={() => onOpen(n)}
              className={cn(
                // 44px below md: the minimum touch target for a phone held on
                // the factory floor. (No font guard needed — this row is not a
                // text-entry control, so there is no iOS auto-zoom to defeat.)
                // ERP `Td` density (py-2.5) from md up, where the row is read
                // with a mouse and the compact rhythm is what makes this look
                // like Order Entry.
                //
                // `px-4 sm:px-5` is the head strip's own inset, so a row's text
                // starts exactly under its group's heading.
                "flex min-h-11 w-full cursor-pointer flex-col gap-0.5 px-4 py-3 text-left transition-colors outline-none sm:px-5 md:min-h-0 md:py-2.5",
                "hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset",
                // A brand edge AND a heavier title. Never colour alone, and
                // never a bare dot.
                !n.readAt && "border-l-[3px] border-l-primary",
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "min-w-0 text-text-1",
                    T.bodySm,
                    !n.readAt && "font-semibold",
                  )}
                >
                  {n.title}
                </span>
                <span
                  className={cn(
                    "num shrink-0 whitespace-nowrap text-text-3",
                    T.caption,
                  )}
                >
                  {relativeTime(n.createdAt)}
                </span>
              </span>
              <span className={cn("line-clamp-2 text-text-2", T.bodySm)}>
                {n.message}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Today and Earlier, on the LOCAL calendar day.
 *
 * NOT `toISOString().slice(0, 10)`: in Asia/Kolkata that rolls over at 5:30am,
 * so everything filed after half past five in the morning would be filed under
 * "Earlier" for the rest of the day.
 */
function splitByDay(items: NotificationRow[]) {
  const now = new Date();
  return {
    today: items.filter((n) => isToday(n.createdAt, now)),
    earlier: items.filter((n) => !isToday(n.createdAt, now)),
  };
}
