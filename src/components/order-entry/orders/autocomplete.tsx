"use client";

// Free-text input with a suggestion dropdown, ported from Order Entry's
// components/ui/autocomplete.tsx and restyled with this app's tokens.
//
// Deliberately NOT a select: suggestions help, but any value is accepted — an
// unknown party / fabric / design is never blocked, because the API adds a
// genuinely new one to the master list on save.
import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// How many suggestions to render at once. Past this the user narrows by typing
// (filtering is instant); a footer row notes how many more match.
const MAX_SUGGESTIONS = 50;

type AutocompleteProps = {
  value: string;
  onValueChange: (value: string) => void;
  suggestions?: string[];
} & Omit<ComponentProps<"input">, "value" | "onChange">;

export function Autocomplete({
  // Defaulted: a caller passing undefined for a moment must degrade to an
  // empty field, not take the page down with it.
  value = "",
  onValueChange,
  suggestions = [],
  className,
  onBlur,
  onFocus,
  onKeyDown,
  ...inputProps
}: AutocompleteProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const { matches, more } = useMemo(() => {
    const typed = (value ?? "").trim().toLowerCase();
    if (!typed) {
      // Nothing typed → browse the whole list (scrollable), first page of it.
      return {
        matches: suggestions.slice(0, MAX_SUGGESTIONS),
        more: Math.max(0, suggestions.length - MAX_SUGGESTIONS),
      };
    }
    // Rank: values that START with the typed text first, then ones that merely
    // contain it — so typing "mil" surfaces "Milano" at the top.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of suggestions) {
      const l = s.toLowerCase();
      if (l === typed) continue; // already fully typed — nothing to suggest
      if (l.startsWith(typed)) starts.push(s);
      else if (l.includes(typed)) contains.push(s);
    }
    const list = [...starts, ...contains];
    return {
      matches: list.slice(0, MAX_SUGGESTIONS),
      more: Math.max(0, list.length - MAX_SUGGESTIONS),
    };
  }, [value, suggestions]);

  const showList = open && matches.length > 0;

  // Keep the keyboard-highlighted option inside the scroll viewport.
  useEffect(() => {
    if (!showList || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [showList, active]);

  function select(v: string) {
    onValueChange(v);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <Input
        {...inputProps}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delayed so a click on a suggestion (mousedown) registers first.
          window.setTimeout(() => setOpen(false), 120);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            // Enter picks the highlighted suggestion. preventDefault also tells
            // the design row's own Enter handler that the key was consumed, so
            // picking a design doesn't ALSO insert a new row.
            e.preventDefault();
            select(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          ref={listRef}
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-auto rounded-[10px] border border-border-strong bg-surface-2 py-1 shadow-[0_12px_32px_rgba(0,0,0,.4)]"
        >
          {/* Keyed by position, not by value: these are free-text lookups with
              no uniqueness guarantee, and a duplicate must never break the list. */}
          {matches.map((s, i) => (
            <li key={`${i}-${s}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                // mousedown fires before the input's blur, so the pick sticks.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[13px]",
                  i === active
                    ? "bg-surface-3 text-text-1"
                    : "text-text-2 hover:bg-surface-3 hover:text-text-1",
                )}
              >
                {s}
              </button>
            </li>
          ))}
          {more > 0 && (
            <li
              aria-hidden
              className="mt-1 border-t border-border px-3 pt-1.5 text-[11.5px] text-text-3"
            >
              +{more} more — keep typing to filter
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
