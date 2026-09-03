"use client";

import * as React from "react";
import { IconAlertTriangle, IconLock } from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteTime, relativeTime } from "@/lib/help-slip/format";
import {
  STATUS_META,
  TIMELINE_COPY,
  statusMeta,
  type HelpSlipLocale,
} from "@/lib/help-slip/meta";
import type { TimelineEvent } from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The timeline — the signature component of this product.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It is the answer to the only question an employee actually asks after filing
 * something: did anything happen? So it is built as a CONVERSATION, not an
 * audit log — oldest first, day-grouped the way a chat thread is. An audit log
 * reads as a machine talking about you; a thread reads as somebody answering
 * you.
 *
 * Geometry, from the source and unchanged:
 *
 *      0    11 13        32
 *      |     ||          |
 *      |   [ () ]        content
 *            ^rail       ^indent
 *
 * A 2px rail at x=11 spans 11–13, so its centre is 12. The node sits in a 24px
 * gutter and is centred in it, which puts its centre on 12 as well — so a 10px
 * node and a 12px node line up on the same rail without either being nudged by
 * hand.
 *
 * ── THE TWO RULES THAT CARRY THE WEIGHT ───────────────────────────────────
 *
 * 1. **STATUS events are the spine.** They take the status colour, filled, out
 *    of `STATUS_META` — never a colour decided here. COMMENT nodes are hollow
 *    and neutral, so the eye can find the state changes without reading a
 *    word, which is what somebody standing at a loom actually does.
 *
 * 2. **INTERNAL notes are staff-only, and the UI must not leak that one
 *    exists.** Not a placeholder, not a gap in the day grouping — an
 *    employee's timeline is byte-identical to one where the note was never
 *    written. The filter below therefore runs BEFORE grouping, keying and the
 *    scroll target, because a day divider that appeared only because of an
 *    internal note would betray it just as surely as rendering it would.
 *
 *    `canSeeInternal` DEFAULTS TO FALSE. The safe answer is the one a caller
 *    gets by forgetting. It is also the third lock, not the first: RLS refuses
 *    these rows through `v_concern_updates`, and `loadConcernUpdates` refuses
 *    them again, before either of them reaches this file.
 */

export type TimelineProps = {
  /**
   * ALREADY ORDERED by the server, and deliberately not re-sorted here.
   *
   * `loadConcernUpdates` orders by `created_at`, then by a tiebreak that puts
   * the reason for a hold before the status change it explains — the two share
   * a timestamp because `now()` is transaction start time. A client-side sort
   * on `createdAt` alone would throw that tiebreak away and re-introduce the
   * ambiguity it exists to remove.
   */
  events: TimelineEvent[];
  locale: HelpSlipLocale;
  /** Whether the READER may see internal notes. False is the safe default. */
  canSeeInternal?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /**
   * A timeline row to scroll to and mark — where a notification's deep link
   * lands. Without it, three notifications read a day apart all drop the
   * reader on the same bottom node, which teaches people the links do not work.
   */
  targetId?: string | null;
};

export function Timeline({
  events,
  locale,
  canSeeInternal = false,
  loading = false,
  error = null,
  onRetry,
  targetId = null,
}: TimelineProps) {
  const visible = React.useMemo(
    () => (canSeeInternal ? events : events.filter((e) => !e.isInternal)),
    [events, canSeeInternal],
  );

  const groups = React.useMemo(() => groupByDay(visible), [visible]);

  // ── where this opens ────────────────────────────────────────────────────
  // The deep-link target, or nothing. Read ONCE, on first paint: a target that
  // kept re-asserting itself would fight the reader the moment they scrolled
  // away from it.
  const targetRef = React.useRef<HTMLLIElement>(null);
  const scrolled = React.useRef(false);

  React.useEffect(() => {
    if (scrolled.current || loading || !targetId) return;
    const node = targetRef.current;
    if (!node) return;
    scrolled.current = true;
    // scrollIntoView({ behavior: 'smooth' }) overrides the CSS scroll-behavior
    // a global reduced-motion block would set, so the preference is honoured
    // HERE or not at all.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      // 'center', because a node somebody was SENT to should not arrive flush
      // against the top edge with its context cut off above it.
      block: "center",
    });
  }, [loading, targetId, groups]);

  if (loading) {
    return (
      <div
        role="status"
        aria-busy
        aria-label="Loading updates"
        className="flex flex-col"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative pb-5 pl-8">
            {i < 2 ? (
              <span
                aria-hidden
                className="absolute top-2 left-[11px] h-full w-0.5 bg-border"
              />
            ) : null}
            <span
              aria-hidden
              className="absolute top-1.5 left-0 flex w-6 justify-center"
            >
              <Skeleton className="size-2.5 rounded-full" />
            </span>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    // A failed fetch must never render as "nothing has happened yet" — they
    // look identical to the reader and only one of them means try again.
    return (
      <div role="alert" className="flex flex-col items-start gap-2 py-2">
        <p
          className={cn(
            "deva flex items-center gap-2 font-semibold text-text-1",
            T.bodySm,
          )}
        >
          <IconAlertTriangle
            className="size-[18px] shrink-0 text-status-red"
            stroke={1.6}
            aria-hidden
          />
          <Bi en="We couldn't load the updates." hi="अपडेट लोड नहीं हो सके।" />
        </p>
        <p className={cn("deva max-w-[48ch] text-text-3", T.caption)}>{error}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <Bi en="Try again" hi="दोबारा कोशिश करें" />
          </Button>
        ) : null}
      </div>
    );
  }

  if (visible.length === 0) {
    /**
     * A LINE, not an illustration.
     *
     * An empty-state card is artwork, a heading and a sentence — about 300px
     * of panel to report that nothing has happened yet. On a concern filed a
     * minute ago that is the single largest element on the page and the one
     * with the least to say, and the fact that it was submitted is already in
     * the header's raised-on date.
     */
    return (
      <p className={cn("deva text-text-3", T.bodySm)}>
        <Bi
          en="Nothing has happened yet. Every update will appear here."
          hi="अभी कुछ नहीं हुआ। हर अपडेट यहाँ दिखेगा।"
        />
      </p>
    );
  }

  return (
    <div className="relative">
      <ol className="flex flex-col">
        {groups.map((group) => (
          <li key={group.key}>
            {/* Sticky day divider, on its OWN solid background: the rail runs
                underneath it, and a transparent divider would have a 2px line
                drawn through the words as the thread scrolls past.
                No uppercase or tracking here, unlike a table header — this
                string can be Devanagari ("आज"), which has no case and whose
                conjuncts tracking shatters. */}
            <h3 className="sticky top-0 z-10 -mx-1 bg-surface px-1 py-2">
              <span
                className={cn("deva font-semibold text-text-2", T.caption)}
              >
                <Bi en={group.label.en} hi={group.label.hi} />
              </span>
            </h3>

            <ol className="flex flex-col">
              {group.events.map((event, index) => (
                <TimelineNode
                  key={event.id}
                  ref={event.id === targetId ? targetRef : undefined}
                  event={event}
                  locale={locale}
                  isTarget={event.id === targetId}
                  isLast={
                    group === groups[groups.length - 1] &&
                    index === group.events.length - 1
                  }
                />
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

type NodeProps = {
  event: TimelineEvent;
  locale: HelpSlipLocale;
  isTarget: boolean;
  isLast: boolean;
};

const TimelineNode = React.forwardRef<HTMLLIElement, NodeProps>(
  function TimelineNode({ event, locale, isTarget, isLast }, ref) {
    const isStatus = event.type === "status_change" || event.type === "resolution";
    const meta = statusMeta(event.newStatus);
    const isResolved =
      event.type === "resolution" || event.newStatus === "resolved";

    return (
      <li
        ref={ref}
        // The anchor a notification links to. Present on EVERY node, so a deep
        // link works from anywhere and not only from the row that was tapped.
        id={`update-${event.id}`}
        className={cn(
          "relative pb-5 pl-8",
          // A deep link that lands in the middle of a long thread has to say
          // WHICH node it meant, or the scroll position is the only clue and
          // it is gone the moment somebody nudges the page. A tint on an
          // inset backdrop marks it without moving anything — no border, no
          // layout shift, and it reads as "here" rather than as a status.
          isTarget &&
            "before:pointer-events-none before:absolute before:-inset-x-2 before:-inset-y-1 before:rounded-field before:bg-accent",
        )}
      >
        {/* The rail is drawn by the node rather than by a shared background,
            so the LAST one can simply stop drawing it — otherwise the line
            overshoots past the final node into empty space. */}
        {!isLast ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-2 left-[11px] h-full w-0.5",
              // An internal note hangs off the thread on a DASHED line: it is
              // beside the conversation, not part of it.
              event.isInternal
                ? "border-l-2 border-dashed border-border bg-transparent"
                : "bg-border",
            )}
          />
        ) : null}

        <span
          aria-hidden
          className="absolute top-1.5 left-0 flex w-6 justify-center"
        >
          {isResolved ? (
            <span className="size-3 rounded-full bg-status-green" />
          ) : isStatus && meta ? (
            <span className={cn("size-2.5 rounded-full", meta.dotClass)} />
          ) : (
            // Hollow and neutral. A comment is punctuation in the thread; the
            // status changes are its spine.
            <span className="size-2.5 rounded-full border-2 border-border-strong bg-surface" />
          )}
        </span>

        <div className="flex flex-col gap-1.5">
          <p
            className={cn(
              "deva flex flex-wrap items-baseline gap-x-2 text-text-1",
              T.bodySm,
            )}
          >
            <span className="font-medium">
              <Describe event={event} locale={locale} />
            </span>
            {/*
              ABSOLUTE in the label, relative in the tooltip.
              "21 minutes ago" is a recency cue, not a record — and this thread
              doubles as the log somebody points at when a coordinator asks
              "when exactly did you say that?".
            */}
            <time
              dateTime={event.createdAt}
              title={relativeTime(event.createdAt, locale)}
              className={cn("num shrink-0 text-text-3", T.caption)}
            >
              {absoluteTime(event.createdAt, locale)}
            </time>
          </p>

          {event.isInternal ? (
            <p
              className={cn(
                "deva flex items-center gap-1.5 text-text-3",
                T.caption,
              )}
            >
              <IconLock className="size-3.5 shrink-0" stroke={1.6} aria-hidden />
              <Bi
                en={TIMELINE_COPY.internalNote.en}
                hi={TIMELINE_COPY.internalNote.hi}
              />
            </p>
          ) : null}

          {event.message ? (
            <div
              className={cn(
                "rounded-field border px-3 py-2",
                // A real border, not a tinted fill alone — the bubble has to
                // read as its own object against a card it shares a
                // background family with.
                event.isInternal
                  ? "border-dashed border-border-strong bg-chip"
                  : "border-border bg-surface-2",
              )}
            >
              <p
                className={cn(
                  "deva whitespace-pre-wrap text-text-1",
                  T.bodySm,
                )}
              >
                {event.message}
              </p>
            </div>
          ) : null}
        </div>
      </li>
    );
  },
);

/**
 * The sentence for a node.
 *
 * "Accepted your 2nd solution" is the one that matters. Everything this
 * product is for — the paper slip asking for three fixes, the coordinator
 * picking one — lands in that line, so it is checked before anything else and
 * it NAMES the position rather than saying "a solution was accepted".
 *
 * The ordinals are written out rather than built from an index: English
 * ordinals are irregular and the Hindi forms are separate words, not a number
 * with a suffix.
 */
function Describe({
  event,
  locale,
}: {
  event: TimelineEvent;
  locale: HelpSlipLocale;
}) {
  const position = event.acceptedSolutionPosition;
  if (position && position >= 1 && position <= 3) {
    const copy = TIMELINE_COPY.accepted[position - 1];
    if (copy) return <Bi en={copy.en} hi={copy.hi} />;
  }

  if (event.type === "assignment") {
    const who = event.isOwnAction ? TIMELINE_COPY.you.en : event.actorName;
    return <Bi en={`Assigned to ${who}`} />;
  }

  if (event.type === "comment") {
    return (
      <Bi
        en={event.isOwnAction ? "You commented" : `${event.actorName} commented`}
        hi={event.isOwnAction ? "आपने टिप्पणी की" : undefined}
      />
    );
  }

  if (event.newStatus) {
    const meta = STATUS_META[event.newStatus];
    return (
      <Bi
        en={`Marked ${meta.labelEn}`}
        hi={locale === "hi" ? `${meta.labelHi} किया गया` : meta.labelHi}
      />
    );
  }

  return <Bi en={TIMELINE_COPY.filed.en} hi={TIMELINE_COPY.filed.hi} />;
}

// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────

type DayGroup = {
  key: string;
  label: { en: string; hi: string };
  events: TimelineEvent[];
};

function groupByDay(events: TimelineEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const date = new Date(event.createdAt);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, label: dayLabel(date), events: [event] });
    }
  }
  return groups;
}

/**
 * The LOCAL calendar day. `toISOString()` would group by UTC, which in
 * Asia/Kolkata (UTC+5:30) splits an evening across two headings.
 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(date: Date): { en: string; hi: string } {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(date) === dayKey(today)) return { ...TIMELINE_COPY.today };
  if (dayKey(date) === dayKey(yesterday)) return { ...TIMELINE_COPY.yesterday };

  const en = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const hi = new Intl.DateTimeFormat("hi-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return { en, hi };
}
