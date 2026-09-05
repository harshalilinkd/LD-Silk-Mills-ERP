"use client";

import * as React from "react";
import { IconChevronDown, IconLoader2, IconX } from "@tabler/icons-react";

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

/**
 * The filter bar.
 *
 * `activeCount` and the clear link are not decoration. Every one of these
 * screens keeps its filters in the URL, so somebody can arrive on a filtered
 * view from a link or a back button and wonder why the table looks empty. A
 * bar that says "1 filter active" and offers to clear it answers that before
 * it is asked.
 */
export function FilterBar({
  children,
  activeCount,
  onClear,
  note,
}: {
  children: React.ReactNode;
  activeCount: number;
  onClear?: () => void;
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {children}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase">
          {activeCount} filter{activeCount === 1 ? "" : "s"} active
        </span>
        <div className="flex items-center gap-3">
          {note}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={activeCount === 0}
              className={cn(
                "cursor-pointer rounded-field px-2 py-1 text-[12px] font-medium transition-colors",
                activeCount === 0
                  ? "cursor-not-allowed text-text-3 opacity-50"
                  : "text-status-red hover:bg-status-red-dim",
              )}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
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
