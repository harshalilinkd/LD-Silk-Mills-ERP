"use client";

import * as React from "react";
import {
  IconChevronDown,
  IconFilter,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The pieces a module screen is built from
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Written for the Checklist, moved here when Petty Cash needed the same
 * toolbar, the same collapsed filter panel and the same dialog. They are the
 * shapes `docs/DESIGN.md` specifies, so a second copy would be a second chance
 * to drift from it — which is exactly the drift the owner asked to have fixed
 * across the whole ERP.
 *
 * `app/(app)/checklist/parts.tsx` re-exports this, so the move touched no
 * Checklist file.
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

/**
 * One field, in a dialog or a form card.
 *
 * ── THIS IS `order-form.tsx`'s FIELD, MOVED ──────────────────────────────
 *
 * The order form is the ERP's oldest and busiest form, and `docs/DESIGN.md`
 * already names its label as THE form label. So rather than keeping a second
 * shape here that merely matched the class, this is that component: the same
 * `gap-[7px]`, the same required asterisk, and the same short hint sitting on
 * the label row rather than under the control.
 *
 * ── `hint` AND `help` ARE DIFFERENT JOBS ─────────────────────────────────
 *
 *   · `hint` is SHORT and sits right-aligned on the label row: "Optional",
 *     "Already exists", "₹1,250.00". It is the field's status, and putting it
 *     beside the label means it costs no vertical space — which is what lets a
 *     ten-field form fit on a screen without scrolling.
 *   · `help` is a sentence and sits under the control. Reach for it only when
 *     a field genuinely needs explaining; two of them in a row is a sign the
 *     labels are wrong.
 *
 * A long sentence squeezed onto the label row wraps and pushes the control
 * down unevenly across a grid, which is exactly what `help` avoids.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  hintTone = "muted",
  help,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  hintTone?: "muted" | "danger" | "success";
  help?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[7px]", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-text-2">
          {label}
          {required ? <span className="font-semibold text-status-red"> *</span> : null}
        </label>
        {hint ? (
          <span
            className={cn(
              "shrink-0 text-xs",
              hintTone === "danger"
                ? "text-status-red"
                : hintTone === "success"
                  ? "text-status-green"
                  : "text-text-3",
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {children}
      {help ? <p className="text-[11.5px] leading-snug text-text-3">{help}</p> : null}
    </div>
  );
}

/**
 * The heading of a block of fields — the order form's, moved here for the
 * same reason `Field` was.
 *
 * A form long enough to need sections gets one of these per section: a small
 * accent chip carrying the section's icon, and a 14.5px bold heading. It is
 * what makes a dialog with ten fields read as three short forms instead of one
 * long list, and it is why the order form has never needed numbered steps.
 */
export function SectionHead({
  icon,
  children,
  aside,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset">
          {icon}
        </span>
        <h2 className="text-[14.5px] font-bold text-text-1">{children}</h2>
      </div>
      {aside}
    </div>
  );
}

/** A multi-line field, styled as the one-line ones are. */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        fieldBase,
        "h-auto resize-y py-2 leading-snug",
        className,
      )}
    />
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
          <div className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
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
 * A section switcher for a screen with more than one view of the same data
 * (Petty Cash's Payees / Categories / Who may use it; add more as they come
 * up) — the exact pill strip `SettingsTabs` and `HelpSlipSettingsTabs` already
 * use for real routes, just driven by a controlled `value`/`onChange` instead
 * of `Link`/`usePathname`, since these sections are not separate pages.
 *
 * NOT `Segmented`: that component is a radiogroup for a single either/or
 * QUESTION ("did it reach on time?"), not a switcher between whole sections of
 * a screen — the two look similar but answer different things, and using the
 * question-picker for a section switch is what made Petty Cash's Masters
 * screen read as unlabelled buttons rather than tabs.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; icon?: React.ReactNode }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1.5 rounded-field border border-border bg-surface-2 p-1.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-[8px] px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-surface text-text-1 shadow-sm"
                : "text-text-3 hover:text-text-1",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
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
  "sticky top-0 z-10 border-b border-border bg-surface px-3.5 py-2.5 text-left text-[11px] font-bold tracking-[0.04em] whitespace-nowrap text-text-1 uppercase";
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
 * The dialog.
 *
 * ── THIS WAS A HAND-ROLLED OVERLAY AND SHOULD NOT HAVE BEEN ──────────────
 *
 * The first version built its own backdrop, focus handling and scroll lock,
 * on the reasoning that a Base UI focus trap would fight the browser's native
 * date picker — which renders outside the React tree, so clicking a day looked
 * like a click outside the dialog.
 *
 * That reasoning was never checked, and it is wrong: Order Entry's order form
 * is a `DialogContent` with `type="date"` inside it and has been in production
 * for months. The cost of not checking was five dialogs that looked like a
 * different application — different title weight, different label style, a
 * plain footer instead of the tinted bar every other dialog in the ERP has.
 *
 * So this is now a thin wrapper over the shell's own Dialog, and the pattern
 * is written down in `docs/DESIGN.md` so the next screen does not have to
 * rediscover it.
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
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn(
          // Bounded and scrollable: the import preview and the task form both
          // outgrow a laptop screen, and a dialog taller than the viewport
          // hides its own Save button.
          "max-h-[85dvh] overflow-auto",
          wide ? "sm:max-w-3xl" : "sm:max-w-md",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && (
            <p className="text-[12.5px] leading-snug text-text-3">{subtitle}</p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">{children}</div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The two buttons a dialog footer has, on the shell's own `Button`.
 *
 * `PrimaryButton` / `QuietButton` below are for TOOLBARS — they are 8 and 9
 * pixels tall and sit beside search boxes. A dialog's actions are the shell's
 * Button at its default size, in a tinted footer bar, the same as Settings and
 * Order Entry. Mixing the two is what made these dialogs look borrowed.
 */
export function DialogCancel({
  onClick,
  disabled,
  children = "Cancel",
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export function DialogSave({
  onClick,
  busy,
  disabled,
  destructive,
  children = "Save",
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(destructive && "bg-status-red text-white hover:bg-status-red/90")}
    >
      {busy && <IconLoader2 className="size-3.5 animate-spin" />}
      {children}
    </Button>
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

// ─── charts ───────────────────────────────────────────────────────────────

export type DonutSegment = { label: string; value: number; className: string };

/**
 * The composition ring.
 *
 * ── WHY AN SVG AND NOT RECHARTS ──────────────────────────────────────────
 *
 * The shell has Recharts, and this is a ring of four arcs with a number in the
 * middle. Recharts brings a responsive container, an animation loop and a
 * tooltip system to draw five `stroke-dasharray` values, and it renders its own
 * text in its own font — which is exactly how the Goods Return chart ended up
 * letterboxed inside its card. Thirty lines of SVG for the geometry and plain
 * HTML for the label sits inside the card correctly at every width.
 *
 * The centre label is HTML on top of the SVG, not `<text>`, so it inherits the
 * page's font and tokens rather than needing them restated in SVG attributes.
 */
export function Donut({
  segments,
  centreLabel,
  centreValue,
  centreSub,
  size = 168,
}: {
  segments: DonutSegment[];
  centreLabel?: React.ReactNode;
  centreValue: React.ReactNode;
  centreSub?: React.ReactNode;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = total > 0 ? (s.value / total) * C : 0;
      const arc = { ...s, len, offset };
      offset += len;
      return arc;
    });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="13"
          className="stroke-surface-3"
        />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="13"
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={-a.offset}
            className={a.className}
          >
            <title>{`${a.label}: ${a.value.toLocaleString("en-IN")}`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centreLabel && (
          <span className="text-[9.5px] font-bold tracking-[0.08em] text-text-3 uppercase">
            {centreLabel}
          </span>
        )}
        <span className="num text-[24px] leading-none font-bold tracking-[-0.02em] text-text-1">
          {centreValue}
        </span>
        {centreSub && (
          <span className="mt-0.5 text-[10.5px] text-text-3">{centreSub}</span>
        )}
      </div>
    </div>
  );
}

/**
 * The rank marker beside a department or a person.
 *
 * Gold, silver and bronze for the top three and a plain number after — the
 * shape the original uses. It is worth keeping because these lists are read at
 * a glance in a meeting, and three coloured badges give the eye somewhere to
 * land in a list of seventeen.
 *
 * `tone` matters: on "most delayed" the top three are the WORST, so the medals
 * would be a reward for being behind. That list passes `tone="bad"` and gets
 * plain numbers with a red cast instead.
 */
export function RankBadge({
  index,
  tone = "good",
}: {
  index: number;
  tone?: "good" | "bad";
}) {
  const medals = [
    "bg-[#e0aa3e] text-white",
    "bg-[#9aa3ad] text-white",
    "bg-[#b06f3a] text-white",
  ];
  const isMedal = tone === "good" && index < 3;
  return (
    <span
      className={cn(
        "num grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-bold",
        isMedal
          ? medals[index]
          : tone === "bad" && index < 3
            ? "bg-status-red-dim text-status-red"
            : "bg-chip text-text-3",
      )}
    >
      {index + 1}
    </span>
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
