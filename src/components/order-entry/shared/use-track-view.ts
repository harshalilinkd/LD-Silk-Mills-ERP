"use client";

// useTrackView — docs/SCREENS.md §3.1
//
// Remembers which of the two views (Tracking / the table) a screen was last
// left on.
//
// Two things it must NOT do:
//
//  1. **Never read localStorage during render.** The server has no such thing,
//     so a value read at render time differs between the server HTML and the
//     first client render and React discards the tree. The read happens in an
//     effect; the first paint always shows `fallback`, then swaps if a stored
//     value says otherwise.
//
//  2. **Never assume localStorage is reachable.** A private window (and some
//     managed-browser policies) throw on the *access itself*, not just on
//     write. Both read and write are wrapped, and a throw leaves the default
//     standing rather than blanking the screen.
//
// A note on keys: the Orders screen uses "oe:orders:view:v2" deliberately. The
// earlier default was the table, and a stored "table" under the old key would
// have kept the tracking view hidden from exactly the users who had already
// visited — the people it was built for.

import * as React from "react";

/** The two views the switch offers. Lives here so ViewSwitch can re-export it
 *  without the hook having to import a client component. */
export type TrackViewValue = "track" | "table";

/**
 * `fallback` is wrapped in `NoInfer` on purpose. Without it,
 * `useTrackView("oe:orders:view:v2", "track")` infers `T = "track"` from the
 * literal, and the returned `setView` then only accepts `"track"` — you
 * cannot switch to the table. Blocking inference from that position makes the
 * generic default (both views) win, while an explicit
 * `useTrackView<"a" | "b">(…)` still works for a screen with other names.
 */
export function useTrackView<T extends string = TrackViewValue>(
  key: string,
  fallback: NoInfer<T>,
) {
  const [view, setViewState] = React.useState<T>(fallback);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) setViewState(stored as T);
    } catch {
      // Private window or blocked storage: keep the fallback.
    }
  }, [key]);

  const setView = React.useCallback(
    (next: T) => {
      setViewState(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // The choice still applies for this session; it just won't persist.
      }
    },
    [key],
  );

  return { view, setView };
}
