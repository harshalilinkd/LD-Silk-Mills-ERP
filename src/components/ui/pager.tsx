"use client";

// Pager — docs/SCREENS.md §0.4
//
//   Previous · [ typed page box ] / N · Next
//
// The typed box is the whole point. The original had Previous/Next only, and
// with 13 pages of orders, walking to page 11 was ten clicks. The page number
// is an `<input>` (`h-8 w-12`, numeric), so it is one keystroke instead.
//
// Rendered by callers only when `totalPages > 1` (§3.8, §7).

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PagerProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  disabled?: boolean;
};

export function Pager({
  page,
  totalPages,
  onPageChange,
  className,
  disabled = false,
}: PagerProps) {
  // The box is a free-text buffer while it has focus. Binding it straight to
  // `page` makes it impossible to clear the field to type a two-digit number:
  // the "" state would snap back to the current page mid-keystroke.
  const [draft, setDraft] = React.useState(String(page));
  React.useEffect(() => {
    setDraft(String(page));
  }, [page]);

  const total = Math.max(1, totalPages);
  const clamp = (n: number) => Math.min(Math.max(1, n), total);

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(page)); // junk in the box: put the real page back
      return;
    }
    const next = clamp(parsed);
    setDraft(String(next));
    if (next !== page) onPageChange(next);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(clamp(page - 1))}
      >
        Previous
      </Button>

      <div className="flex items-center gap-1.5 text-[13px] text-text-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={total}
          value={draft}
          disabled={disabled}
          aria-label={`Page number, of ${total}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(String(page));
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "num h-8 w-12 rounded-field border border-border-strong bg-surface px-1.5 text-center text-[13px] font-medium text-text-1 outline-none",
            "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            // The stepper arrows steal half the 48px box and invite clicking
            // rather than typing, which is the behaviour this control exists
            // to replace.
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          )}
        />
        <span className="whitespace-nowrap">
          of <span className="num">{total}</span>
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || page >= total}
        onClick={() => onPageChange(clamp(page + 1))}
      >
        Next
      </Button>
    </div>
  );
}
