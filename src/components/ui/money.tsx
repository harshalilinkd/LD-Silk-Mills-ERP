"use client";

// Money — docs/SCREENS.md §0.4, §2.9
//
// The animated rupee figure. Wraps NumberFlow with `prefix="₹"` and
// min/maximumFractionDigits: 2, carrying `.num`.
//
// The digits roll as the user types a rate on the new-order screen — the
// screen's one signature effect. `.num` (tabular figures, see globals.css) is
// what keeps it from jittering: with proportional digits every roll changes
// the string's width and the whole bar twitches.
//
// Package note: the React binding is `@number-flow/react` (default export),
// which depends on the `number-flow` custom-element core. Verified on disk —
// `@number-flow/react` exports `NumberFlow` as its DEFAULT, plus
// NumberFlowGroup / useCanAnimate / usePrefersReducedMotion as named exports.

import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

export type MoneyProps = {
  value: number;
  className?: string;
  /** Override the ₹ prefix (e.g. "" for a bare figure in a mono column). */
  prefix?: string;
  suffix?: string;
  /** Locale for grouping. Indian grouping (1,23,456.00) by default. */
  locales?: Intl.LocalesArgument;
};

export function Money({
  value,
  className,
  prefix = "₹",
  suffix,
  locales = "en-IN",
}: MoneyProps) {
  return (
    <NumberFlow
      value={Number.isFinite(value) ? value : 0}
      locales={locales}
      prefix={prefix}
      suffix={suffix}
      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      className={cn("num", className)}
    />
  );
}

/**
 * The same animated treatment for a plain count — KPI tiles use this with
 * `maximumFractionDigits: 0` (§1.2B). Kept beside Money so the two share the
 * one NumberFlow import and the `.num` rule.
 */
export function AnimatedNumber({
  value,
  className,
  prefix,
  suffix,
  fractionDigits = 0,
  locales = "en-IN",
}: {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  fractionDigits?: number;
  locales?: Intl.LocalesArgument;
}) {
  return (
    <NumberFlow
      value={Number.isFinite(value) ? value : 0}
      locales={locales}
      prefix={prefix}
      suffix={suffix}
      format={{
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }}
      className={cn("num", className)}
    />
  );
}
