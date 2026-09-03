"use client";

import Link from "next/link";
import { IconAlertTriangle, IconBell } from "@tabler/icons-react";

import { Panel, PanelHead } from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/help-slip/format";
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
 *
 * It is a PANEL CARD: a tinted, ruled head with an accent icon chip over a
 * flush body. The head is what makes a card announce itself, and the body sits
 * flush so a row's `px-4` lines up under the head's.
 */
export function NotificationsPanel({
  items,
  loading,
  error,
  onRetry,
}: {
  items: NotificationRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHead
        titleEn="Notifications"
        icon={<IconBell />}
        aside={
          <Link
            href="/help-slip/notifications"
            className={cn("text-accent-text hover:underline", T.bodySm)}
          >
            View all
          </Link>
        }
      />

      {loading ? (
        <div
          className="flex flex-col gap-2.5 p-3"
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
           again.

           The ERP's notice strip: a 16px leading glyph, the sentence, and the
           action as a trailing underlined button. */
        <div className="p-3">
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2 rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2",
              T.bodySm,
            )}
          >
            <IconAlertTriangle
              className="mt-[1px] size-4 shrink-0 text-status-red"
              stroke={1.6}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-status-red">
              We couldn&apos;t load this.
            </span>
            {/* `min-h-11` below md, not `h-11`: this sits in a flex row beside
                the message, so a fixed height would stretch the strip. The
                inline look is unchanged — only the tap box grows. */}
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-11 shrink-0 cursor-pointer items-center font-semibold text-status-red underline-offset-2 hover:underline md:min-h-0"
            >
              Try again
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        /* ONE LINE, left-aligned, at the top of the card.
           Not a 200px illustration: this panel sits beside Recent under
           `items-start`, and a centred bell announcing that nothing has
           happened would be the largest thing on the dashboard and the one
           with the least to say. The head already carries the bell. */
        <p className={cn("px-4 py-4 text-text-2", T.bodySm)}>Nothing new.</p>
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
                  "flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-surface-2",
                  // Unread is a brand-tinted left edge AND a heavier title.
                  // Never colour alone — around 8% of the factory cannot tell
                  // two rows apart if a tint is the only difference.
                  !n.readAt && "border-l-[3px] border-l-primary",
                )}
              >
                <span
                  className={cn(
                    "text-text-1",
                    T.bodySm,
                    !n.readAt && "font-semibold",
                  )}
                >
                  {n.title}
                </span>
                <span className={cn("line-clamp-1 text-text-3", T.caption)}>
                  {n.message}
                </span>
                <span className={cn("num text-text-3", T.caption)}>
                  {relativeTime(n.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
