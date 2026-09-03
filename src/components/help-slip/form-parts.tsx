"use client";

import * as React from "react";

import { CONTROL, T } from "@/components/help-slip/type-scale";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The controls the Help Slip WRITE screens are built from.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The read screens needed a search box and some filters, which `page-parts`
 * and `filters` already carry. Forms need a grid, labels, hints, errors and
 * required markers, and there is no styled textarea or checkbox in
 * `components/ui` — so these live here rather than being written out five
 * times across three screens, each with its own idea of what 44px means.
 *
 * Three rules, all of them from the ERP and none of them cosmetic:
 *
 *  1. **Fields live in a GRID, never a single column.** `<FieldGrid>` is 1 /
 *     sm:2 / lg:3, and a field that genuinely needs the whole row says so with
 *     `SPAN_FULL`. A 720px column of full-width inputs was the single loudest
 *     reason this module did not read as the rest of the ERP: the same form in
 *     Order Entry is 1128px wide across four grids.
 *  2. **Every control is 44px tall with 16px text BELOW `md`**, and the ERP's
 *     compact 36px / 13px from `md` up. 44px is the minimum touch target for a
 *     phone held on the factory floor; anything under 16px makes iOS Safari
 *     auto-zoom on focus, after which it never zooms back out and the person is
 *     stranded on a 2× page. `CONTROL` in type-scale.ts owns both halves of the
 *     split, and `TEXTAREA` below mirrors it.
 *  3. **An error is announced, not merely coloured.** `role="alert"` and
 *     `aria-describedby`, and the input carries `aria-invalid` so it is not
 *     colour alone doing the work.
 */

// ─── the field grid ────────────────────────────────────────────────────────

/**
 * THE ERP FIELD GRID. One column below `sm`, two at `sm`, three at `lg`.
 *
 * Single-column below `sm` is mandatory, not a preference — two 44px controls
 * side by side at 360px is two unusable controls.
 *
 * The column gap grows and the row gap does not (`gap-x-3 gap-y-2
 * sm:gap-x-4`): a label sits directly above its own control and does not need
 * 16px of air under the field before it, but two fields side by side do need
 * separating.
 *
 * There is deliberately no `[&_input]:h-9` descendant override here. Order
 * Entry's grid carries one because its global `Input` is 32px; every control
 * in this module already carries `CONTROL`, and forcing 36px would break the
 * touch target below `md`.
 */
export function FieldGrid({
  cols = 3,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** Columns at the widest step. 2 stops at `sm`; 3 goes on to `lg`. */
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 sm:gap-x-4",
        cols === 3 && "lg:grid-cols-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * HOW A FIELD SPANS. Pass one of these as the `className` of any `Field`,
 * `TextField`, `TextAreaField`, `SelectField` or `CheckboxField` — it lands on
 * the field's own wrapper, which is the grid item:
 *
 *   <TextField className={SPAN_FULL} … />
 *
 * All the steps are written out on purpose. A bare `col-span-3` overflows the
 * two-column `sm` grid and silently collapses the row.
 *
 * Reserve `SPAN_FULL` for controls that genuinely need the width — a
 * description textarea, a long free-text line. A short select taking the whole
 * row is how a grid turns back into a column.
 */
export const SPAN_FULL = "col-span-1 sm:col-span-2 lg:col-span-3";
/** Half of a three-column row: two tracks at `sm` and at `lg`. */
export const SPAN_HALF = "col-span-1 sm:col-span-2 lg:col-span-2";

// ─── controls ──────────────────────────────────────────────────────────────

/** CONTROL's textarea twin. Height comes from `rows`, so only the font and the
 *  padding step: 16px below md (the iOS auto-zoom guard — see CONTROL), 13px
 *  and ERP padding from md up. */
export const TEXTAREA = cn(
  "w-full rounded-field border border-border bg-surface px-3 py-2.5",
  "text-base text-text-1 outline-none transition-colors",
  "placeholder:text-text-placeholder focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "md:px-2.5 md:py-2 md:text-[13px]",
);

export type FieldProps = {
  id: string;
  labelEn: string;
  /** One short clause. It renders on the LABEL ROW — see the note on `Field`. */
  helperEn?: string;
  /** Rendered as a sentence under the control, and announced. */
  error?: React.ReactNode;
  required?: boolean;
  /** Also on the label row, hard right — a character counter, say. */
  meta?: React.ReactNode;
  /** Hides the visible label but keeps it as the accessible name. */
  labelHidden?: boolean;
  /** Lands on the field's own wrapper — this is the grid span slot. */
  className?: string;
  children: React.ReactNode;
};

/**
 * Label + hint on one row, then the control, then the error.
 *
 * THE HINT IS ON THE LABEL ROW, RIGHT-ALIGNED — NEVER UNDER THE INPUT. This is
 * the ERP's rule and the biggest single thing that was wrong here. A helper
 * sentence under a control is a second full-width line per field, so six
 * fields became a page you had to scroll; worse, a hint that appears and
 * disappears shifts every field below it while somebody is typing. The label
 * row is `justify-between`, so the hint occupies space that is already
 * reserved and costs no height at all.
 *
 * A hint too long for that row is too long full stop: shorten the sentence,
 * do not move it back under the control.
 *
 * The ERROR is the one thing that does sit under the control, because it is
 * about what was typed rather than about what to type, and it must be next to
 * the thing it is complaining about.
 *
 * `aria-describedby` points the control at whichever one is live. The error
 * REPLACES the helper in that association when present: hearing both the
 * advice and the complaint is one sentence too many at the moment somebody is
 * trying to fix something.
 */
export function Field({
  id,
  labelEn,
  helperEn,
  error,
  required,
  meta,
  labelHidden,
  className,
  children,
}: FieldProps) {
  const showHelper = !error && Boolean(helperEn);
  const showMeta = Boolean(meta) && !labelHidden;
  return (
    <div className={cn("flex min-w-0 flex-col gap-[7px]", className)}>
      {/* `flex-wrap`: the helper sits on this row now, so a long label and a
          long hint must be able to fall to two lines rather than squeezing
          each other. `gap-y-1` keeps the wrapped case from touching. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label
          htmlFor={id}
          className={cn(
            "min-w-0 text-text-2",
            T.label,
            labelHidden && "sr-only",
          )}
        >
          {labelEn}
          {required ? (
            <span aria-hidden className="ml-0.5 font-semibold text-status-red">
              *
            </span>
          ) : null}
        </label>
        {showHelper || showMeta ? (
          <span className="ml-auto flex min-w-0 items-baseline justify-end gap-2 text-right">
            {showHelper ? (
              <span
                id={`${id}-helper`}
                className={cn("text-text-3", T.caption)}
              >
                {helperEn}
              </span>
            ) : null}
            {showMeta ? (
              <span className={cn("num shrink-0 text-text-3", T.caption)}>
                {meta}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className={cn("text-status-red", T.caption)}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error: unknown, helper: unknown) {
  if (error) return `${id}-error`;
  if (helper) return `${id}-helper`;
  return undefined;
}

// ─── text input ────────────────────────────────────────────────────────────

export function TextField({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  softMax,
  autoComplete = "off",
  autoCapitalize,
  enterKeyHint,
  disabled,
  ...field
}: Omit<FieldProps, "children" | "meta"> & {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  /**
   * Advice, not a limit. Past it the counter goes amber and nothing stops —
   * `maxLength` is the hard stop, and the two are different messages.
   */
  softMax?: number;
  autoComplete?: string;
  autoCapitalize?: "none" | "sentences" | "words";
  enterKeyHint?: "next" | "done" | "send";
  disabled?: boolean;
}) {
  const over = softMax !== undefined && value.length > softMax;
  return (
    <Field
      {...field}
      id={id}
      meta={
        softMax !== undefined ? (
          <span className={over ? "text-status-amber" : undefined}>
            {value.length}/{softMax}
          </span>
        ) : undefined
      }
    >
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        required={field.required}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(id, field.error, field.helperEn)}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        enterKeyHint={enterKeyHint}
        className={cn(CONTROL, "w-full", field.error && "border-status-red")}
      />
    </Field>
  );
}

// ─── textarea ──────────────────────────────────────────────────────────────

export function TextAreaField({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  rows = 3,
  disabled,
  textareaRef,
  ...field
}: Omit<FieldProps, "children" | "meta"> & {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <Field {...field} id={id}>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        required={field.required}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(id, field.error, field.helperEn)}
        autoCapitalize="sentences"
        className={cn(TEXTAREA, field.error && "border-status-red")}
      />
    </Field>
  );
}

// ─── native select ─────────────────────────────────────────────────────────

/**
 * Native, deliberately. On a mid-range Android the OS wheel beats any listbox
 * we would build, costs no JavaScript, and is the control people already know
 * — the same call `filters.tsx` documents for the filter dropdowns.
 */
export function SelectField({
  id,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  disabled,
  ...field
}: Omit<FieldProps, "children" | "meta"> & {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  options: { value: string; label: string }[];
  /** The empty first option. Present only while nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field {...field} id={id}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        required={field.required}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(id, field.error, field.helperEn)}
        className={cn(
          CONTROL,
          "w-full cursor-pointer",
          field.error && "border-status-red",
        )}
      >
        {placeholder !== undefined ? (
          <option value="">{placeholder}</option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ─── checkbox ──────────────────────────────────────────────────────────────

/**
 * A checkbox with a real description under it.
 *
 * The whole row is the label, so the touch target is the sentence rather than
 * a 17px square — which is the difference between usable and not on a phone
 * held one-handed.
 */
export function CheckboxField({
  id,
  checked,
  onChange,
  labelEn,
  descriptionEn,
  disabled,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  labelEn: string;
  descriptionEn?: string;
  disabled?: boolean;
  /** Lands on the label row — this is the grid span slot. */
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        // 44px tap row below md: the minimum touch target for a phone held on
        // the factory floor. ERP density (36px) from md up.
        "flex min-h-11 cursor-pointer items-start gap-3 md:min-h-9 md:gap-2.5",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        // The ERP's own checkbox recipe (order-entry/settings/settings-ui.tsx).
        className="mt-0.5 size-[17px] shrink-0 cursor-pointer rounded-[5px] accent-primary"
      />
      <span className="min-w-0">
        <span className={cn("block text-text-1", T.label)}>{labelEn}</span>
        {descriptionEn ? (
          <span className={cn("mt-0.5 block text-text-3", T.caption)}>
            {descriptionEn}
          </span>
        ) : null}
      </span>
    </label>
  );
}

// ─── the whole-form alert ──────────────────────────────────────────────────

/**
 * A tinted, bordered block for a failure that belongs to the form rather than
 * to one field — a refused submit, a summary of what still needs fixing.
 *
 * `tone` because the same shape carries a neutral notice (offline, queued),
 * and the two must not look the same: a red box that means "you are offline"
 * teaches people to ignore red boxes.
 */
export function FormAlert({
  tone = "error",
  role = "alert",
  children,
}: {
  tone?: "error" | "neutral";
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2 rounded-field border px-3 py-2",
        T.bodySm,
        tone === "error"
          ? "border-status-red/30 bg-status-red-dim text-status-red"
          : "border-border bg-surface-2 text-text-2",
      )}
    >
      {children}
    </div>
  );
}
