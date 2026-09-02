"use client";

// Segmented — docs/SCREENS.md §0.4
//
// A radiogroup rendered as a segmented control. `tone` neutral / positive /
// negative; sizes sm / md.
//
// It is a real `role="radiogroup"` of `role="radio"` buttons rather than a row
// of toggle buttons, because these are always mutually-exclusive answers to
// one question ("Did it reach on time? Yes / No", "Coordinator judged /
// Customer said", "By party / By fabric"). Arrow keys move between options,
// and only the selected option is a tab stop — the standard radio pattern.
//
// `tone` colours the SELECTED segment: CRM uses `negative` so that answering
// "No" to *did it reach on time* is visibly the unhappy branch (§7).

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedTone = "neutral" | "positive" | "negative";
export type SegmentedSize = "sm" | "md";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
};

// `text-surface` is the correct on-fill colour for BOTH themes without a dark:
// variant: --surface is white in light mode (over the deep #15803d green) and
// near-black in dark mode (over the pale #4ade80 green). It inverts with the
// hue it sits on, which is exactly what a solid status fill needs.
const SELECTED_TONE: Record<SegmentedTone, string> = {
  neutral: "bg-primary text-primary-foreground",
  positive: "bg-status-green text-surface",
  negative: "bg-status-red text-surface",
};

const SIZE: Record<SegmentedSize, string> = {
  sm: "h-7 px-2.5 text-[12px] [&_svg]:size-3.5",
  md: "h-8 px-3 text-[13px] [&_svg]:size-4",
};

export type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  tone?: SegmentedTone;
  size?: SegmentedSize;
  /** Accessible name for the group — what question these options answer. */
  label?: string;
  className?: string;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  tone = "neutral",
  size = "md",
  label,
  className,
}: SegmentedProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, delta: number) {
    const n = options.length;
    for (let step = 1; step <= n; step += 1) {
      const i = (from + delta * step + n * step) % n;
      if (!options[i]?.disabled) {
        onChange(options[i].value);
        refs.current[i]?.focus();
        return;
      }
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-pill border border-border-strong bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            // Roving tabindex: the group is one tab stop, arrows pick inside.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill font-medium whitespace-nowrap transition-colors outline-none",
              SIZE[size],
              selected
                ? SELECTED_TONE[tone]
                : "text-text-2 hover:text-text-1 hover:bg-chip",
              "focus-visible:ring-3 focus-visible:ring-ring/40",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
