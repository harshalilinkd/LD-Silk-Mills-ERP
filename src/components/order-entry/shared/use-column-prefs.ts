"use client";

// useColumnPrefs — docs/SCREENS.md §4A.4
//
// Persists which columns of a wide table a user has switched off, keyed
// per-user (the Order status board uses `oe:order-status:cols:<email>`).
//
// Three decisions, all of which have a bug behind them:
//
//  1. **It stores the HIDDEN ids, not the visible ones.** If it stored the
//     visible set, a column added in a later release would be absent from
//     every existing user's stored list and would silently never appear for
//     them. Storing the complement makes "new column" default to visible.
//
//  2. **Persistence is gated on a `loaded` flag** set after the first client
//     read. Without it the mount-time write (running before the read effect
//     has restored anything) saves an empty set over the real one, and the
//     user's choices evaporate on every reload.
//
//  3. **Restored ids are filtered against the current column list**, so a
//     column removed in a later release leaves no orphan id sitting in
//     storage forever, and `hidden` never contains something unrenderable.
//
// `locked` columns (the order number) are rendered, disabled in the picker,
// and can never be hidden — they are the row's identity.

import * as React from "react";

export type ColumnDef = {
  id: string;
  label: string;
  /** Rendered and shown in the picker, but disabled and always visible. */
  locked?: boolean;
};

export function useColumnPrefs(key: string, columns: readonly ColumnDef[]) {
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = React.useState(false);

  // The set of ids a user is allowed to hide. Recomputed from the CURRENT
  // column list, which is what makes decision 3 work.
  const toggleableIds = React.useMemo(
    () => new Set(columns.filter((c) => !c.locked).map((c) => c.id)),
    [columns],
  );

  // Read in an effect, never during render: localStorage does not exist on
  // the server and a render-time read would desync hydration.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHidden(
            new Set(
              parsed.filter(
                (id): id is string =>
                  typeof id === "string" && toggleableIds.has(id),
              ),
            ),
          );
        }
      }
    } catch {
      // Unreadable or malformed: everything stays visible.
    }
    setLoaded(true);
    // Intentionally keyed on `key` alone. Re-running when `toggleableIds`
    // changes identity would re-read storage and undo a toggle made in the
    // same session; the filter above already uses the latest set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  React.useEffect(() => {
    if (!loaded) return; // decision 2 — do not clobber before the read lands
    try {
      window.localStorage.setItem(key, JSON.stringify([...hidden]));
    } catch {
      // Choices apply for this session; they just won't persist.
    }
  }, [key, hidden, loaded]);

  const isVisible = React.useCallback(
    (id: string) => !hidden.has(id),
    [hidden],
  );

  const toggle = React.useCallback(
    (id: string) => {
      if (!toggleableIds.has(id)) return; // locked column: no-op
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [toggleableIds],
  );

  const reset = React.useCallback(() => setHidden(new Set()), []);

  const visibleColumns = React.useMemo(
    () => columns.filter((c) => c.locked || !hidden.has(c.id)),
    [columns, hidden],
  );

  return {
    /** Ids the user has switched off — this is what gets persisted. */
    hidden,
    /** True once the first client-side read has happened. */
    loaded,
    isVisible,
    toggle,
    reset,
    visibleColumns,
  };
}
