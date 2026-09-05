"use client";

import * as React from "react";
import {
  IconChevronDown,
  IconFilter,
  IconLoader2,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The pieces every Checklist screen is built from
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY NATIVE CONTROLS, WHEN THE SHELL HAS A SELECT COMPONENT ───────────
 *
 * The filter bars here use `<select>` and `<input type="date">` rather than
 * the Base UI primitives the rest of the ERP uses, and that is a decision
 * rather than an oversight:
 *
 *   · The screens being rebuilt use them, and the owner asked for the same UI.
 *     The date fields in particular carry the browser's own calendar button,
 *     which is what their team already reaches for.
 *   · A filter bar can carry six controls on one row. Six portalled popups
 *     inside a bar that itself scrolls sideways on a phone is a stack of
 *     positioning problems for no gain.
 *   · Base UI's `<Select.Value>` renders the RAW VALUE unless `items` is also
 *     passed to `<Select>` — a trap this repo has already been caught by once,
 *     and it costs a filter bar reading "E2ND" where it should read "Every 2nd
 *     Tuesday".
 *
 * They are styled to the same tokens as everything else, so they do not read
 * as foreign. `appearance-none` on the selects removes the platform arrow so
 * ours can sit in the same place on every browser.
 */

// ─── form control styling, in one place ───────────────────────────────────

export const fieldBase =
  "h-9 w-full rounded-field border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none transition-colors placeholder:text-text-placeholder focus:border-primary/50 focus:ring-3 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

export const selectBase = cn(
  fieldBase,
  "cursor-pointer appearance-none bg-[length:0] pr-8",
);

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase"
    >
      {children}
    </label>
  );
}

/** A labelled control in a filter bar or a form. */
export function Field({
  label,
  children,
  className,
  hint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] leading-snug text-text-3">{hint}</p>}
    </div>
  );
}

/** A native select with our chevron, since `appearance-none` removes the theirs. */
export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(selectBase, className)} {...props}>
        {children}
      </select>
      <IconChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-text-3" />
    </div>
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

// ─── page furniture ───────────────────────────────────────────────────────

export function PageHead({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          {title}
        </h1>
        {lede && <p className="mt-1 text-[13px] text-text-3">{lede}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

// ─── the filter & toolbar pattern (docs/DESIGN.md) ────────────────────────

/**
 * ── WHY THESE REPLACED A SIX-COLUMN GRID ─────────────────────────────────
 *
 * The first version of these screens put every filter in an always-open card:
 * six labelled fields, three rows deep on a laptop, plus a permanent footer
 * strip reading "0 FILTERS ACTIVE". On the Tasks screen that pushed the first
 * row of actual data below the fold before a single task existed.
 *
 * `docs/DESIGN.md` already had the answer, written after CRM shipped exactly
 * this mistake: **KPI tiles, then ONE toolbar row, then a collapsed Filters
 * panel, then the table.** Search stays in the toolbar because it is how you
 * find one row; everything that NARROWS the set folds away behind the button.
 * A single dot on that button is the only "something is filtered" signal.
 *
 * These are the shapes from that document, so the Checklist reads like Orders
 * and CRM rather than like a third opinion.
 */

/**
 * One toolbar row.
 *
 * Below `sm` search takes a row of its own and the rest sits underneath;
 * at `sm` the second group becomes `display: contents` and everything merges
 * back into one line. One class change rather than two parallel layouts.
 */
export function Toolbar({
  search,
  children,
}: {
  search: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:min-w-[200px] sm:flex-1">{search}</div>
      {children && (
        <div className="flex items-center gap-2 sm:contents">{children}</div>
      )}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <>
      <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-text-3" />
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldBase, "pl-8")}
      />
    </>
  );
}

/**
 * The toggle. The dot is the ONLY active-state signal — recolouring the button
 * as well makes a row of filtered screens louder than the one thing that
 * changed.
 */
export function FiltersButton({
  open,
  active,
  onClick,
}: {
  open: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 transition-colors hover:border-border-strong hover:text-text-1"
    >
      <IconFilter className="size-4" />
      Filters
      {active && <span className="ml-0.5 size-1.5 rounded-full bg-primary" />}
    </button>
  );
}

/** The panel, rendered only when the button is on. */
export function FilterPanel({
  children,
  active,
  onClear,
  columns = "sm:grid-cols-4",
}: {
  children: React.ReactNode;
  active: boolean;
  onClear: () => void;
  /** Override when a screen has appreciably more or fewer fields. */
  columns?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-field border border-border bg-surface-2 p-3">
      <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2.5", columns)}>
        {children}
      </div>
      {active && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer rounded-field px-2 py-1 text-[12px] font-medium text-text-2 transition-colors hover:bg-chip hover:text-text-1"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One field inside the panel: an 11px caption above the control.
 *
 * A panel is something somebody opened on purpose to look at, so the extra
 * line per field buys a control that explains itself. The toolbar above it
 * gets no labels for the same reason in reverse.
 */
export function FilterField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-text-2">{label}</span>
      {children}
    </label>
  );
}

/**
 * A table that scrolls sideways inside its own card.
 *
 * `overflow-x-auto` is on this wrapper and nowhere else, so a nine-column
 * table on a phone scrolls itself rather than making the whole page scroll
 * sideways — the difference between a table you can read and a layout that
 * looks broken.
 */
export function TableCard({
  children,
  className,
  empty,
}: {
  children?: React.ReactNode;
  className?: string;
  empty?: React.ReactNode;
}) {
  if (empty) {
    return (
      <div className="rounded-card border border-border bg-surface px-4 py-14 text-center">
        {empty}
      </div>
    );
  }
  return (
    <div className={cn("overflow-hidden rounded-card border border-border bg-surface", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const th =
  "sticky top-0 z-10 border-b border-border bg-surface px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[0.06em] whitespace-nowrap text-text-1 uppercase";
export const td = "border-b border-border px-3.5 py-3 text-[13px] text-text-2";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {icon && (
        <span className="grid size-11 place-items-center rounded-full bg-chip text-text-3">
          {icon}
        </span>
      )}
      <h3 className="text-[14.5px] font-bold text-text-1">{title}</h3>
      {body && <p className="max-w-sm text-[13px] text-text-3">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ─── the modal ────────────────────────────────────────────────────────────

/**
 * A plain dialog, not the shell's Base UI one.
 *
 * These carry forms whose fields include native date inputs, and a portalled
 * popup that traps focus fights the browser's own calendar panel — which is
 * itself a popup, rendered outside the React tree, that the focus trap tries
 * to pull focus back from. The result is a date field that closes the moment
 * you click a day. Escape and the backdrop still close this, and the panel
 * still takes focus on open.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind scrolling under the dialog on a phone.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-4 py-10 backdrop-blur-[2px]">
      {/* The backdrop closes on click; the panel stops the click reaching it. */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full rounded-card border border-border bg-surface shadow-xl outline-none",
          wide ? "max-w-3xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-text-1">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] leading-snug text-text-3">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-0.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-field text-text-3 transition-colors hover:bg-chip hover:text-text-1"
          >
            <IconX className="size-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── buttons ──────────────────────────────────────────────────────────────

export function PrimaryButton({
  children,
  busy,
  className,
  ...props
}: React.ComponentProps<"button"> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-field bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {busy && <IconLoader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function QuietButton({
  children,
  busy,
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"button"> & {
  busy?: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-field border px-2.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger"
          ? "border-status-red/30 bg-status-red-dim/40 text-status-red hover:bg-status-red-dim"
          : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text-1",
        className,
      )}
    >
      {busy && <IconLoader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/** The one place an error from a server action is shown. */
export function ErrorNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
    >
      {children}
    </p>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "green" | "red" | "amber" | "blue" | "grey";
  children: React.ReactNode;
}) {
  const map = {
    green: "bg-status-green-dim text-status-green",
    red: "bg-status-red-dim text-status-red",
    amber: "bg-status-amber-dim text-status-amber",
    blue: "bg-status-blue-dim text-status-blue",
    grey: "bg-chip text-text-2",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        map[tone],
      )}
    >
      {children}
    </span>
  );
}
