"use client";

import * as React from "react";
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";

import { useDebouncedValue } from "@/components/order-entry/shared/use-debounced-value";
import { cn } from "@/lib/utils";
import type { MasterType } from "@/lib/goods-return/master-data";
import { quickAddMaster } from "./master-actions";

export type Option = { id: number; name: string };

/**
 * A searchable picker over one of the four master lists.
 *
 * ── WHY IT SEARCHES THE SERVER ───────────────────────────────────────────
 *
 * There are 5,562 parties and 923 qualities. A native `<select>` with 5,562
 * options is unusable on a desktop and unspeakable on a phone, and preloading
 * them to filter in the browser is ~300 KB of names shipped on every visit to
 * answer something the database answers in milliseconds. So it queries as you
 * type, debounced.
 *
 * ── THE PARTY→BROKER DEPENDENCY IS THE POINT ─────────────────────────────
 *
 * `partyId` narrows the broker list through `party_brokers` — 5,359 rows whose
 * entire job is to stop somebody choosing a broker who does not trade for that
 * party. The Broker picker is therefore DISABLED until a party is chosen, and
 * says why rather than sitting there empty and inert.
 *
 * ── ADDING A NAME INLINE ─────────────────────────────────────────────────
 *
 * Kept from the original, because the alternative is abandoning a half-typed
 * return to go and add a party in another screen. A broker added while a party
 * is selected is also MAPPED to that party — otherwise it is added, selected
 * once, and then never appears for that party again.
 */
export function MasterPicker({
  type,
  value,
  label,
  onChange,
  partyId,
  placeholder,
  disabled,
  disabledHint,
  allowAdd = true,
  required,
  invalid,
}: {
  type: MasterType;
  /** Selected id, or "" for nothing. */
  value: string;
  /** The selected name, kept by the caller so an edit form can show it. */
  label: string;
  onChange: (next: { id: string; name: string }) => void;
  partyId?: string;
  placeholder?: string;
  disabled?: boolean;
  disabledHint?: string;
  allowAdd?: boolean;
  required?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [options, setOptions] = React.useState<Option[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const debounced = useDebouncedValue(q, 250);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // Fetch on open and on every settled keystroke. The abort matters: without
  // it a slow early request can land after a fast later one and repopulate the
  // list with results for a query the person has already moved past.
  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ type, q: debounced });
    if (type === "brokers" && partyId) params.set("partyId", partyId);
    fetch(`/api/goods-return/master?${params}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { options: Option[] }) => setOptions(d.options ?? []))
      .catch((e) => {
        if (e?.name !== "AbortError") setOptions([]);
      })
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [open, debounced, type, partyId]);

  // Close on an outside click. Escape is handled on the input itself.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (o: Option) => {
    onChange({ id: String(o.id), name: o.name });
    setOpen(false);
    setQ("");
  };

  const add = async () => {
    const name = q.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    const res = await quickAddMaster(
      type,
      name,
      type === "brokers" && partyId ? Number(partyId) : undefined,
    );
    setAdding(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    pick({ id: res.id, name: res.name });
  };

  const exact = options.some(
    (o) => o.name.toLowerCase() === q.trim().toLowerCase(),
  );

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-field border bg-surface px-2.5 text-left text-[12.5px] transition-colors",
          "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
          invalid ? "border-status-red/60" : "border-border",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            label ? "text-text-1" : "text-text-placeholder",
          )}
        >
          {label ||
            (disabled && disabledHint) ||
            placeholder ||
            "Search…"}
        </span>
        <IconChevronDown className="size-4 shrink-0 text-text-3" />
      </button>

      {required && !value && !disabled && (
        <span className="sr-only">This field is required</span>
      )}

      {open && !disabled && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-card border border-border bg-surface shadow-lg">
          <div className="relative border-b border-border">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[0]) pick(options[0]);
                  else if (allowAdd && q.trim()) void add();
                }
              }}
              placeholder="Type to search…"
              className="h-9 w-full bg-transparent pr-2.5 pl-8 text-[12.5px] text-text-1 outline-none placeholder:text-text-placeholder"
            />
          </div>

          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {loading && options.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-text-3">
                <IconLoader2 className="size-3.5 animate-spin" /> Searching…
              </li>
            )}
            {!loading && options.length === 0 && (
              <li className="px-3 py-2 text-[12.5px] text-text-3">
                {q.trim() ? "No match." : "Start typing to search."}
              </li>
            )}
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={String(o.id) === value}
                  onClick={() => pick(o)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-text-1 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {String(o.id) === value && (
                    <IconCheck className="size-3.5 shrink-0 text-accent-text" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {allowAdd && q.trim() && !exact && (
            <button
              type="button"
              onClick={() => void add()}
              disabled={adding}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[12.5px] font-medium text-accent-text hover:bg-surface-2 disabled:opacity-60"
            >
              {adding ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconPlus className="size-3.5" />
              )}
              Add &ldquo;{q.trim()}&rdquo;
            </button>
          )}

          {error && (
            <p className="border-t border-border px-3 py-2 text-[12px] text-status-red">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
