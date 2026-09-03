"use client";

import * as React from "react";

import { Bi } from "@/components/help-slip/bilingual";
import { CONTROL, T } from "@/components/help-slip/type-scale";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The controls the Help Slip WRITE screens are built from.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The read screens needed a search box and some filters, which `page-parts`
 * and `filters` already carry. Forms need labels, helpers, errors and required
 * markers, and there is no styled textarea or checkbox in `components/ui` — so
 * these live here rather than being written out five times across three
 * screens, each with its own idea of what 44px means.
 *
 * Three rules, all of them from the source and none of them cosmetic:
 *
 *  1. **Every control is 44px tall with 16px text BELOW `md`**, and the ERP's
 *     compact 36px / 13px from `md` up. 44px is the minimum touch target for a
 *     phone held on the factory floor; anything under 16px makes iOS Safari
 *     auto-zoom on focus, after which it never zooms back out and the person is
 *     stranded on a 2× page. `CONTROL` in type-scale.ts owns both halves of the
 *     split, and `TEXTAREA` below mirrors it.
 *  2. **Labels render `English (हिंदी)` inline**, through `<Bi>` — the Hindi at
 *     0.85em/400/text-3, never stacked and never the same weight. This is the
 *     paper slip's own layout.
 *  3. **An error is announced, not merely coloured.** `role="alert"` and
 *     `aria-describedby`, and the input carries `aria-invalid` so it is not
 *     colour alone doing the work.
 */

/** CONTROL's textarea twin. Height comes from `rows`, so only the font and the
 *  padding step: 16px below md (the iOS auto-zoom guard — see CONTROL), 13px
 *  and ERP padding from md up. */
export const TEXTAREA = cn(
  "deva w-full rounded-field border border-border bg-surface px-3 py-2.5",
  "text-base text-text-1 outline-none transition-colors",
  "placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "md:px-2.5 md:py-2 md:text-[13px]",
);

export type FieldProps = {
  id: string;
  labelEn: string;
  labelHi?: string;
  helperEn?: string;
  helperHi?: string;
  /** Rendered as a sentence under the control, and announced. */
  error?: React.ReactNode;
  required?: boolean;
  /** Sits on the label row, right-aligned — a character counter, say. */
  meta?: React.ReactNode;
  /** Hides the visible label but keeps it as the accessible name. */
  labelHidden?: boolean;
  children: React.ReactNode;
};

/**
 * Label, control, helper, error — in that order, wired together.
 *
 * The helper is `aria-describedby` on the control, so a screen reader hears
 * "Department, choose a department, required" rather than a bare field name.
 * The error REPLACES the helper in that association when present: hearing both
 * the advice and the complaint is one sentence too many at the moment somebody
 * is trying to fix something.
 */
export function Field({
  id,
  labelEn,
  labelHi,
  helperEn,
  helperHi,
  error,
  required,
  meta,
  labelHidden,
  children,
}: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      {/* The hint/counter stays ON the label row, as the ERP puts it: an
          appearing hint must not shift every field below it. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label
          htmlFor={id}
          className={cn(
            "deva text-text-2",
            T.label,
            labelHidden && "sr-only",
          )}
        >
          <Bi en={labelEn} hi={labelHi} />
          {required ? (
            <span aria-hidden className="ml-0.5 font-semibold text-status-red">
              *
            </span>
          ) : null}
        </label>
        {meta && !labelHidden ? (
          <span className={cn("num text-text-3", T.caption)}>{meta}</span>
        ) : null}
      </div>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className={cn("deva text-status-red", T.caption)}
        >
          {error}
        </p>
      ) : helperEn ? (
        <p id={`${id}-helper`} className={cn("deva text-text-3", T.caption)}>
          <Bi en={helperEn} hi={helperHi} />
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
        className={cn(
          CONTROL,
          "deva w-full",
          field.error && "border-status-red",
        )}
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
          "deva w-full cursor-pointer",
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
  labelHi,
  descriptionEn,
  descriptionHi,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  labelEn: string;
  labelHi?: string;
  descriptionEn?: string;
  descriptionHi?: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        // 44px tap row below md: the minimum touch target for a phone held on
        // the factory floor. ERP density (36px) from md up.
        "flex min-h-11 cursor-pointer items-start gap-3 md:min-h-9 md:gap-2.5",
        disabled && "cursor-not-allowed opacity-50",
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
        <span className={cn("deva block text-text-1", T.label)}>
          <Bi en={labelEn} hi={labelHi} />
        </span>
        {descriptionEn ? (
          <span className={cn("deva mt-0.5 block text-text-3", T.caption)}>
            <Bi en={descriptionEn} hi={descriptionHi} />
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
        "deva rounded-field border px-3 py-2",
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
