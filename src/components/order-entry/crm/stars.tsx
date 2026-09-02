"use client";

// Stars / StarPicker — docs/SCREENS.md §7.1.3, §7.2.7, §7.4.3, §7.5.4
//
// `Stars` is the read-only figure that appears in four tables; `StarPicker` is
// the control on the ratings stage.
//
// Two behaviours the spec is explicit about:
//
//  1. **1–5 from the keyboard with a row focused.** The picker is one tab stop
//     (a radiogroup) and digits set the score directly, because a coordinator
//     scoring four criteria on a phone call should not have to aim at a 17px
//     star five times.
//  2. **Clicking the current score clears it** — and clearing means the key is
//     DELETED from the ratings map, never stored as a zero. `null` and `0` are
//     not the same number (§8.16): a zero reads as "they scored us zero".
//
// Icons are Tabler (docs/DESIGN.md: never mix in a second icon set); the amber
// fill is `--status-amber`, this app's translation of the spec's `warning`.

import * as React from "react";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${value} out of 5`}
    >
      {Array.from({ length: 5 }, (_, i) =>
        i < value ? (
          <IconStarFilled
            key={i}
            style={{ width: size, height: size }}
            className="text-status-amber"
          />
        ) : (
          <IconStar
            key={i}
            style={{ width: size, height: size }}
            className="text-text-3"
          />
        ),
      )}
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
  label,
  size = 17,
  disabled = false,
  className,
}: {
  value: number | null;
  /** `null` when the current score is clicked again — the caller deletes the key. */
  onChange: (value: number | null) => void;
  /** What is being scored, for the accessible name. */
  label: string;
  size?: number;
  disabled?: boolean;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    // "Press 1–5 with a row focused." — §7.2.7's own instruction to the user,
    // so it has to work from any star in the row, not just the first.
    if (e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      onChange(Number(e.key));
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(5, (value ?? 0) + 1);
      onChange(next);
      refs.current[next - 1]?.focus();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (value ?? 0) - 1;
      if (next < 1) {
        onChange(null);
        refs.current[0]?.focus();
      } else {
        onChange(next);
        refs.current[next - 1]?.focus();
      }
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange(null);
    }
    void i;
  }

  return (
    <span
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((n, i) => {
        const on = value !== null && n <= value;
        return (
          <button
            key={n}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 5`}
            disabled={disabled}
            // Roving tabindex: one tab stop for the whole row, which is what
            // makes "press 1–5 with a row focused" a single keystroke.
            tabIndex={value === n || (value === null && n === 1) ? 0 : -1}
            onClick={() => onChange(value === n ? null : n)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "cursor-pointer rounded-[4px] p-px outline-none transition-transform",
              "hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/50",
              disabled && "cursor-not-allowed opacity-50 hover:scale-100",
            )}
          >
            {on ? (
              <IconStarFilled
                style={{ width: size, height: size }}
                className="text-status-amber"
              />
            ) : (
              <IconStar
                style={{ width: size, height: size }}
                className="text-text-3"
              />
            )}
          </button>
        );
      })}
    </span>
  );
}
