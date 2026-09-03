"use client";

import Link from "next/link";
import { IconAlertTriangle, IconBell } from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
import { Panel, PanelHead } from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/help-slip/format";
import type { HelpSlipLocale } from "@/lib/help-slip/meta";
import type { NotificationRow } from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The newest five notifications, rendered ONLY at ≥1280px.
 *
 * It is ADDITIVE: at any narrower width the notification centre is one click
 * away in the sidebar, and the vertical space is worth more than the
 * duplication. That is why it is `hidden xl:block` at the call site rather
 * than a responsive layout of its own.
 *
 * Its data rides in the dashboard's single request — this component takes
 * rows as props rather than fetching. A panel that ran its own query would be
 * a second pinned connection for five rows the dashboard had already read.
 */
export function NotificationsPanel({
  items,
  loading,
  error,
  onRetry,
  locale,
}: {
  items: NotificationRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  locale: HelpSlipLocale;
}) {
  return (
    <Panel className="flex flex-col overflow-hidden">
      <PanelHead titleEn="Notifications" titleHi="सूचनाएँ">
        <Link
          href="/help-slip/notifications"
          className={cn(
            "deva text-accent-text hover:underline",
            T.bodySm,
          )}
        >
          <Bi en="View all" hi="सभी देखें" />
        </Link>
      </PanelHead>

      {loading ? (
        <div
          className="flex flex-col gap-3 p-4"
          role="status"
          aria-busy
          aria-label="Loading notifications"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        /* A failed fetch used to fall through to `data ?? []` in the source,
           which rendered the exact same "Nothing new" row as a genuinely empty
           inbox. The two read identically and only one of them means try
           again. */
        <div role="alert" className="flex items-center gap-3 px-5 py-4">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-status-red-dim text-status-red"
          >
            <IconAlertTriangle className="size-5" stroke={1.6} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("deva block text-text-2", T.bodySm)}>
              <Bi
                en="We couldn't load this."
                hi="यह लोड नहीं हो सका।"
              />
            </span>
          </span>
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "deva shrink-0 cursor-pointer text-accent-text hover:underline",
              T.bodySm,
            )}
          >
            <Bi en="Try again" hi="दोबारा कोशिश करें" />
          </button>
        </div>
      ) : items.length === 0 ? (
        /* ONE ROW, left-aligned, at the top of the card.
           Not a 200px illustration: this panel sits beside Recent under
           `items-start`, and a centred bell announcing that nothing has
           happened would be the largest thing on the dashboard and the one
           with the least to say. A fact this small gets a line. */
        <div className="flex items-center gap-3 px-5 py-4">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-text"
          >
            <IconBell className="size-5" stroke={1.6} />
          </span>
          <span className={cn("deva min-w-0 text-text-2", T.bodySm)}>
            <Bi en="Nothing new." hi="कुछ नया नहीं।" />
          </span>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((n) => (
            <li key={n.id} className="border-b border-border last:border-0">
              <Link
                // The concern itself, with `?u=` naming the timeline row the
                // notification was about — `<Timeline targetId>` scrolls to it
                // and marks it. A notification with no concern (a sign-in
                // request) has nowhere on a concern to land, so it falls back
                // to the list rather than to a dead link.
                //
                // Always the EMPLOYEE's view: this panel only renders on the
                // employee dashboard. The coordinator's equivalent is the
                // notification centre, which picks by role.
                href={
                  n.concernId
                    ? `/help-slip/concerns/${n.concernId}${n.concernUpdateId ? `?u=${n.concernUpdateId}` : ""}`
                    : "/help-slip/concerns"
                }
                className={cn(
                  "flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-surface-2",
                  // Unread is a brand-tinted left edge AND a heavier title.
                  // Never colour alone — around 8% of the factory cannot tell
                  // two rows apart if a tint is the only difference.
                  !n.readAt && "border-l-[3px] border-l-primary",
                )}
              >
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
                    "deva line-clamp-1 text-text-3",
                    T.caption,
                  )}
                >
                  {n.message}
                </span>
                <span className={cn("num text-text-3", T.caption)}>
                  {relativeTime(n.createdAt, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
