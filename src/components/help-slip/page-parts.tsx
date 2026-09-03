"use client";

import * as React from "react";
import {
  IconAlertTriangle,
  IconSearch,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

import { CONTROL, T } from "@/components/help-slip/type-scale";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The ERP's page vocabulary, as Help Slip components.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A page header, three card shapes, a metadata strip, a search box, a
 * load-more button and the four list states.
 *
 * The cards are the point. The complaint this file answers is that Help Slip
 * "still looks outdated", and the measurement behind it was structural, not
 * typographic: at 1440px the Order Entry new-order form is two bordered cards
 * and four multi-column grids; the Help Slip form was two cards and a single
 * 720px column. So the rule here is the ERP's rule — NOTHING FLOATS. Every
 * logical group is a bordered card on `bg-surface`, every card announces
 * itself with an accent icon chip and a bold heading, and the page ground is
 * only ever visible BETWEEN cards.
 *
 * `<ListState>` is the other reason this file exists. The source app's rule is
 * that "every list, table and timeline ships loading + empty (both kinds) +
 * error in the same step as its happy path": a failed request must NEVER
 * render as "no results" — they look identical to the reader and only one of
 * them means try again. "Both kinds" of empty is the part that gets dropped. A
 * list with no rows because nothing has been filed is good news and says so; a
 * list with no rows because five filters are on is a dead end and needs a way
 * out of it. They are different screens.
 */

// ─── page header ───────────────────────────────────────────────────────────

/**
 * The ERP page heading, verbatim: a 22/700/-0.01em title, a 13px subtitle
 * under it, and an action cluster hard right that wraps under the title on a
 * phone rather than squeezing it.
 *
 * IT CARRIES NO PADDING OF ITS OWN. The space between the header and the first
 * region belongs to the page root, which must be `flex flex-col gap-5` — the
 * same root every Order Entry screen uses. A header owning its own bottom
 * padding double-spaces itself the moment the root gets that gap.
 */
export function PageHeader({
  titleEn,
  subtitle,
  meta,
  actions,
}: {
  titleEn: string;
  subtitle?: React.ReactNode;
  /** "Showing 12 of 40" — a live region, so it is announced when it changes. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className={cn("text-text-1", T.h1)}>{titleEn}</h1>
        {subtitle ? (
          <p className={cn("mt-1 text-text-3", T.body)}>{subtitle}</p>
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
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

// ─── the card head chip ────────────────────────────────────────────────────

/**
 * The accent icon chip both card heads share: 28px, an accent wash, an
 * accent-text glyph. The form-card variant adds a 15%-alpha inset ring for
 * definition (the wash alone is faint on the light theme); the panel-card
 * variant does not, exactly as the ERP ships them.
 */
function HeadChip({
  icon,
  variant,
}: {
  icon: React.ReactNode;
  variant: "form" | "panel";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center bg-accent text-accent-text",
        variant === "form"
          ? "rounded-[9px] ring-1 ring-accent-text/15 ring-inset [&_svg]:size-4"
          : "rounded-lg [&_svg]:size-[15px]",
      )}
    >
      {icon}
    </span>
  );
}

// ─── section card (the form card) ──────────────────────────────────────────

/**
 * THE ERP FORM CARD — the shape a group of fields lives in.
 *
 * `flex flex-col gap-3` with exactly two children in the common case: the head
 * row and a `<FieldGrid>` (form-parts.tsx). `p-3 sm:p-4` is the whole padding
 * story — density steps once, at `sm`, and there is no `lg:` step anywhere in
 * the ERP.
 *
 * `border-border`, not `border-border-strong`: the strong border plus
 * `shadow-sm` is reserved for a repeatable block the user can add and remove
 * (an Nth solution row, an Nth fabric row). A single section is the hairline.
 *
 * The head is inline and UNRULED — the card's own `gap-3` separates it from
 * the grid. `aside` is the right-hand slot: a count chip, a link, a status
 * pill, a small button.
 */
export function SectionCard({
  title,
  icon,
  aside,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  /** A Tabler glyph. The chip sizes it to 16px, so pass it bare. */
  icon?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const head = title || icon || aside;
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:p-4",
        className,
      )}
      {...props}
    >
      {head ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? <HeadChip icon={icon} variant="form" /> : null}
            {title ? (
              <h2 className={cn("min-w-0 text-text-1", T.h3)}>{title}</h2>
            ) : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The dashed footer rule inside a section card — "controls that act on THIS
 * card", visibly distinct from the solid rule that separates content.
 */
export const CARD_FOOTER_ROW =
  "relative mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-border-strong pt-3";

// ─── panel card ────────────────────────────────────────────────────────────

/**
 * THE ERP PANEL CARD — a header strip over a flush body: a table, a list, a
 * timeline, a chart.
 *
 * `overflow-hidden` is load-bearing twice over: it clips a table's square
 * corners to the card radius, and it is the only thing stopping `PanelHead`'s
 * tinted strip painting square corners over the rounded border.
 *
 * `shadow-sm` is the ERP's mark of a card you can PRESS, so it is not baked in
 * here: the Help Slip surfaces that are press targets add it at the call site.
 */
export function Panel({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The panel card's head: a TINTED, RULED strip.
 *
 * `bg-surface-2/40` + `border-b border-border/70` is what makes a panel read as
 * a panel rather than as a heading somebody left on the page. The body below
 * then sits flush and supplies its own padding, so a table's `px-3` cells line
 * up under the head's `px-4`.
 *
 * `ml-auto` on the aside, never `justify-between`: the row is `flex-wrap`, and
 * `justify-between` on a wrapped row strands the aside on a line of its own.
 *
 * The heading is 15/600 here and 14.5/700 on a `SectionCard`. Both ship in the
 * ERP and each belongs to its own head recipe — a tinted strip over a table,
 * versus an unruled row over a field grid. Do not mix them.
 */
export function PanelHead({
  titleEn,
  note,
  icon,
  aside,
  children,
}: {
  titleEn: string;
  /** An inline subtitle BESIDE the title, never under it. */
  note?: React.ReactNode;
  /** A Tabler glyph. The chip sizes it to 15px, so pass it bare. */
  icon?: React.ReactNode;
  /** The right-hand slot. `children` lands here too, for older call sites. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const right = aside ?? children;
  return (
    // `rounded-t-card` so the strip clips ITSELF. `Panel` carries
    // `overflow-hidden`, which would do it — but a panel holding a chart has to
    // turn that off (a tooltip at the first or last point is drawn outside the
    // plot box), and without this the tinted strip would then square off the
    // card's top corners.
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-t-card border-b border-border/70 bg-surface-2/40 px-4 py-3 sm:px-5">
      {icon ? <HeadChip icon={icon} variant="panel" /> : null}
      <h2 className={cn("text-text-1", T.h2)}>{titleEn}</h2>
      {note ? (
        <span className="text-[12px] font-medium text-text-2">{note}</span>
      ) : null}
      {right ? <div className="ml-auto shrink-0">{right}</div> : null}
    </div>
  );
}

/** A count beside a heading. Pairs with `PanelHead` / `SectionCard`'s aside. */
export function CountChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="num rounded-pill bg-chip px-2 py-0.5 text-[12px] font-semibold text-text-2">
      {children}
    </span>
  );
}

// ─── metadata strip (detail screens) ───────────────────────────────────────

/**
 * THE ERP METADATA STRIP — the band of facts that sits directly under a detail
 * screen's record header, before the body sections.
 *
 * ONE column on a phone, two from `sm`, then `cols` from `md`. The ERP's own
 * literal is `grid-cols-2 … sm:grid-cols-4`, but two columns at 320px gives
 * each track ~130px, which truncates a coordinator's full name and wraps
 * "Raised" onto two lines — and this module's below-`sm` rule outranks the
 * ERP's density, because this is the employee's phone-first detail screen.
 *
 * It is a card like everything else, because a bare row of label/value pairs
 * on the page ground is exactly the "floating" tell this rebuild removes.
 *
 * The labels are `uppercase tracking-[0.04em]`, which is the ERP literal and
 * which only became legal here when the Hindi went: Devanagari has no case and
 * tracking shatters conjuncts, so this strip previously needed a substitute
 * recipe. It does not any more.
 */
export function MetaStrip({
  cols = 4,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** Columns from `md` up. Always 1 below `sm`, 2 between. */
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3.5 rounded-card border border-border bg-surface px-5 py-[18px] sm:grid-cols-2",
        cols === 3 ? "md:grid-cols-3" : cols === 4 ? "md:grid-cols-4" : "",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * One fact inside a `MetaStrip`.
 *
 * A missing value renders `—`, never a blank: an empty cell reads as a
 * rendering bug, and on a detail screen "we do not have this" is information.
 */
export function MetaItem({
  label,
  numeric,
  className,
  children,
}: {
  label: React.ReactNode;
  /** Figures, dates, IDs, counts — anything that wants tabular digits. */
  numeric?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] tracking-[0.04em] text-text-3 uppercase">
        {label}
      </div>
      <div className={cn("mt-0.5 text-[13px] text-text-1", numeric && "num")}>
        {empty ? "—" : children}
      </div>
    </div>
  );
}

// ─── search ────────────────────────────────────────────────────────────────

/**
 * 16px text in a 44px box BELOW `md`, 13px in a 36px box from `md` up — see
 * `CONTROL`. Below `md` anything smaller makes iOS Safari auto-zoom on focus
 * and it never zooms back out; from `md` up this is the ERP toolbar search.
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
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-3 md:left-2.5 md:size-4"
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
        className={cn(CONTROL, "w-full pl-10 md:pl-8")}
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
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-center py-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onClick}
        disabled={loading}
        // 44px below md: the minimum touch target for a phone held on the
        // factory floor. ERP-compact (36px) from md up.
        className="h-11 w-full md:h-9 md:w-auto"
      >
        {loading ? <Spinner /> : null}
        {label}
      </Button>
    </div>
  );
}

// ─── the four list states ──────────────────────────────────────────────────

export type EmptyCopy = {
  icon: TablerIcon;
  titleEn: string;
  bodyEn?: string;
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
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-text-2">
        <Spinner />
        <span className={T.body}>{loadingLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-2.5 px-4 py-10 text-center"
      >
        <IconAlertTriangle
          className="size-[30px] text-status-red"
          stroke={1.6}
          aria-hidden
        />
        <p className={cn("font-semibold text-text-1", T.body)}>
          We couldn&apos;t load this.
        </p>
        <p className={cn("max-w-[60ch] text-text-2", T.bodySm)}>{error}</p>
        {/* 44px below md. `size="sm"` is h-7, and this is the phone's ONLY
            recovery path from a failed load — six screens render it. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-11 md:h-8"
        >
          Try again
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 pb-6">
        <EmptyState
          icon={empty.icon}
          title={empty.titleEn}
          description={empty.bodyEn}
        />
        {empty.action ? (
          /* 44px below md. This slot carries "Raise a concern" on an empty My
             concerns, and "Clear filters" — the only way out of a filter set
             that matches nothing. Neither may be a 28px target on a phone. */
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={empty.action.onClick}
            className="h-11 md:h-8"
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
 * Column headers carry uppercase and letter-spacing (docs/DESIGN.md's table
 * rule, and the shipped `ui/data-table.tsx`) — a muted, un-cased table header
 * is one of the loudest "not the ERP" tells there is.
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
      className="inline-flex cursor-pointer items-center gap-1 tracking-[0.04em] uppercase outline-none hover:text-accent-text focus-visible:text-accent-text"
    >
      {label}
      <span aria-hidden className="text-text-3">
        {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
