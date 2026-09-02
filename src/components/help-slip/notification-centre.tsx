"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { IconBell, IconChecks } from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
import {
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
import { useHelpSlipLocale } from "@/lib/help-slip/context";
import { isToday, relativeTime } from "@/lib/help-slip/format";
import type { HelpSlipLocale } from "@/lib/help-slip/meta";
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
 */
export function NotificationCentre() {
  const locale = useHelpSlipLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const beginOptimistic = async (fn: (n: NotificationRow) => NotificationRow) => {
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
   * The one kind with nowhere on a concern to land is `access_requested`: it
   * announces a sign-in request, not a concern, and has no `concern_id`. Until
   * the admin screens are ported it stays on this page rather than falling
   * through to a no-op that looks like a broken link.
   */
  const open = (n: NotificationRow) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (!n.concernId) return;
    // The LIST, not a bare detail route — a notification is a reason to look
    // at something, and arriving somewhere with no way back but the browser
    // button is how people get stranded. The concern's own page lands here
    // once the detail screen is ported.
    router.push("/help-slip/concerns");
  };

  const { today, earlier } = splitByDay(items);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col">
      <Reveal index={0}>
        <PageHeader
          titleEn="Notifications"
          titleHi="सूचनाएँ"
          subtitle={
            <Bi
              en="Updates on your concerns."
              hi="आपकी शिकायतों पर अपडेट।"
            />
          }
          actions={
            // Only when it would DO something.
            unreadShown > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="h-11"
              >
                {markAllRead.isPending ? (
                  <Spinner />
                ) : (
                  <IconChecks className="size-5" stroke={1.6} aria-hidden />
                )}
                <Bi en="Mark all read" hi="सब पढ़ा हुआ करें" />
              </Button>
            ) : null
          }
        />
      </Reveal>

      <div className="flex flex-col gap-4 pb-10">
        <Reveal index={1}>
          <ListState
            loading={q.isPending}
            error={q.isError ? (q.error as Error).message : null}
            onRetry={() => void q.refetch()}
            isEmpty={items.length === 0}
            empty={{
              icon: IconBell,
              titleEn: "Nothing new.",
              titleHi: "कुछ नया नहीं।",
              bodyEn:
                "When a coordinator answers one of your concerns, you'll hear about it here.",
              bodyHi:
                "जब कोऑर्डिनेटर आपकी किसी शिकायत का जवाब देंगे, आपको यहाँ पता चलेगा।",
            }}
          >
            <div
              className={cn(
                "flex flex-col gap-4 transition-opacity",
                q.isFetching && !q.isFetchingNextPage && !q.isPending
                  ? "opacity-60"
                  : null,
              )}
            >
              {today.length > 0 ? (
                <Group
                  labelEn="Today"
                  labelHi="आज"
                  items={today}
                  locale={locale}
                  onOpen={open}
                />
              ) : null}
              {earlier.length > 0 ? (
                <Group
                  labelEn="Earlier"
                  labelHi="इससे पहले"
                  items={earlier}
                  locale={locale}
                  onOpen={open}
                />
              ) : null}
            </div>
          </ListState>
        </Reveal>

        {q.hasNextPage ? (
          <LoadMore
            onClick={() => void q.fetchNextPage()}
            loading={q.isFetchingNextPage}
            label="Load more"
            labelHi="और दिखाएँ"
          />
        ) : null}
      </div>
    </div>
  );
}

/** One card per group — the day label lives INSIDE it, not floating above. */
function Group({
  labelEn,
  labelHi,
  items,
  locale,
  onOpen,
}: {
  labelEn: string;
  labelHi: string;
  items: NotificationRow[];
  locale: HelpSlipLocale;
  onOpen: (n: NotificationRow) => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <PanelHead titleEn={labelEn} titleHi={labelHi} />
      <ul className="flex flex-col">
        {items.map((n) => (
          <li key={n.id} className="border-b border-border last:border-0">
            <button
              type="button"
              onClick={() => onOpen(n)}
              className={cn(
                "flex min-h-11 w-full cursor-pointer flex-col gap-0.5 px-4 py-3 text-left transition-colors outline-none",
                "hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset",
                // A brand edge AND a heavier title. Never colour alone, and
                // never a bare dot.
                !n.readAt && "border-l-[3px] border-l-primary",
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "deva text-text-1",
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
                  {relativeTime(n.createdAt, locale)}
                </span>
              </span>
              <span
                className={cn("deva line-clamp-2 text-text-2", T.bodySm)}
              >
                {n.message}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
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
