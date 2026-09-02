"use client";

import * as React from "react";
import {
  IconAlertTriangle,
  IconSearch,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
import { CONTROL, T } from "@/components/help-slip/type-scale";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * The chrome every Help Slip screen shares: a page header, a panel, a search
 * box, a load-more button, and the three list states.
 *
 * The last one is the reason this file exists. The source app's rule is that
 * "every list, table and timeline ships loading + empty (both kinds) + error
 * in the same step as its happy path", and the CRM port here says the same
 * thing in different words: a failed request must NEVER render as "no
 * results" — they look identical to the reader and only one of them means try
 * again. `<ListState>` makes the four cases one decision at one call site.
 *
 * "Both kinds" of empty is the part that gets dropped. A list with no rows
 * because nothing has been filed is good news and says so; a list with no rows
 * because five filters are on is a dead end and needs a way out of it. They
 * are different screens.
 */

// ─── page header ───────────────────────────────────────────────────────────

export function PageHeader({
  titleEn,
  titleHi,
  subtitle,
  meta,
  actions,
}: {
  titleEn: string;
  titleHi?: string;
  subtitle?: React.ReactNode;
  /** "Showing 12 of 40" — a live region, so it is announced when it changes. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h1 className={cn("deva text-text-1", T.h1)}>
          {titleEn}
          {titleHi ? <span className="deva hi"> ({titleHi})</span> : null}
        </h1>
        {subtitle ? (
          <p className={cn("deva mt-1 text-text-3", T.bodySm)}>{subtitle}</p>
        ) : null}
        {meta ? (
          <p
            aria-live="polite"
            className={cn("num mt-1 text-text-3", T.caption)}
          >
            {meta}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      ) : null}
    </div>
  );
}

// ─── panel ─────────────────────────────────────────────────────────────────

/** A card. `bg-surface` + one hairline border — a border, never a shadow. */
export function Panel({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-card border border-border bg-surface shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

/** The header row inside a Panel: a title, and optionally a link on the right. */
export function PanelHead({
  titleEn,
  titleHi,
  note,
  children,
}: {
  titleEn: string;
  titleHi?: string;
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-3">
      <h2 className={cn("deva text-text-1", T.h3)}>
        {titleEn}
        {titleHi ? <span className="deva hi"> ({titleHi})</span> : null}
      </h2>
      {note ? (
        <span className={cn("deva text-text-3", T.caption)}>{note}</span>
      ) : null}
      {children}
    </div>
  );
}

// ─── search ────────────────────────────────────────────────────────────────

/**
 * 16px text in a 44px box, like every control in this module: anything
 * smaller makes iOS Safari auto-zoom on focus and it never zooms back out.
 *
 * `type="search"` with the mobile keyboard hints set — `enterKeyHint="search"`
 * puts a search key on the on-screen keyboard instead of a newline, and
 * autoCapitalize/autoCorrect off stops a phone helpfully turning `LD-019` into
 * `Ld-019`.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1 md:max-w-80", className)}>
      <IconSearch
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-3"
        stroke={1.6}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        className={cn(CONTROL, "deva w-full pl-10")}
      />
    </div>
  );
}

// ─── load more ─────────────────────────────────────────────────────────────

/**
 * An EXPLICIT button, never infinite scroll.
 *
 * Auto-loading traps the reader against the bottom of the viewport: the page
 * keeps growing, the end never arrives, and there is no way to reach it. On a
 * phone with a bottom bar it is worse — the thing you are scrolling toward
 * moves away at exactly your scroll speed.
 */
export function LoadMore({
  onClick,
  loading,
  label,
  labelHi,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  labelHi?: string;
}) {
  return (
    <div className="flex justify-center py-4">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onClick}
        disabled={loading}
        className="h-11 w-full md:w-auto"
      >
        {loading ? <Spinner /> : null}
        <Bi en={label} hi={labelHi} />
      </Button>
    </div>
  );
}

// ─── the four list states ──────────────────────────────────────────────────

export type EmptyCopy = {
  icon: TablerIcon;
  titleEn: string;
  titleHi?: string;
  bodyEn?: string;
  bodyHi?: string;
  action?: { label: string; onClick: () => void };
};

/**
 * Loading, error, empty-because-filtered, empty-because-nothing, or the rows.
 *
 * The error branch prints the message the ROUTE wrote, never an upstream one,
 * and always offers a retry — an error state with no way forward is a dead
 * end with an apology on it.
 */
export function ListState({
  loading,
  error,
  onRetry,
  isEmpty,
  empty,
  children,
  loadingLabel = "Loading…",
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isEmpty: boolean;
  empty: EmptyCopy;
  children: React.ReactNode;
  loadingLabel?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-16 text-text-3">
        <Spinner />
        <span className={cn("deva", T.bodySm)}>{loadingLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center"
      >
        <IconAlertTriangle
          className="size-[30px] text-status-red"
          stroke={1.6}
          aria-hidden
        />
        <p className={cn("deva font-semibold text-text-1", T.bodySm)}>
          <Bi
            en="We couldn't load this."
            hi="यह लोड नहीं हो सका।"
          />
        </p>
        <p className={cn("deva max-w-[42ch] text-text-3", T.caption)}>{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <Bi en="Try again" hi="दोबारा कोशिश करें" />
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 pb-8">
        <EmptyState
          icon={empty.icon}
          title={<Bi en={empty.titleEn} hi={empty.titleHi} />}
          description={
            empty.bodyEn ? <Bi en={empty.bodyEn} hi={empty.bodyHi} /> : undefined
          }
        />
        {empty.action ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={empty.action.onClick}
          >
            {empty.action.label}
          </Button>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}

// ─── sortable column header ────────────────────────────────────────────────

/**
 * A `<Th>`'s inner button.
 *
 * Column headers are the ONE place in this module that carry uppercase and
 * letter-spacing (docs/DESIGN.md's table rule), and they are therefore
 * English-only BY DESIGN — the same call the source app makes. Devanagari has
 * no case and tracking shatters conjuncts, so a Hindi column header set this
 * way would be broken, not merely translated. Everything else on the row is
 * bilingual.
 */
export function SortHeader({
  label,
  active,
  direction,
  onSort,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={`Sort by ${label}`}
      // `uppercase` and `tracking` are RESTATED here, not inherited from `Th`.
      // The browser's own stylesheet sets `text-transform: none` on <button>,
      // which beats the inherited value — so a sortable header rendered as
      // "Raised by" next to a plain one rendering "ASSIGNED", in the same row.
      // Safe on this element specifically: column headers are English-only by
      // design (see the note above), which is the whole reason casing is
      // allowed here at all.
      className="inline-flex cursor-pointer items-center gap-1 tracking-[0.04em] uppercase outline-none hover:text-accent-text focus-visible:text-accent-text"
    >
      {label}
      <span aria-hidden className="text-text-3">
        {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
