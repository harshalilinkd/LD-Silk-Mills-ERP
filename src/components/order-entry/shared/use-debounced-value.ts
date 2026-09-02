"use client";

// useDebouncedValue — docs/SCREENS.md §3.2, §4A.4, §4B.2, §7
//
// The filter panel and the live search boxes fire on every keystroke; the
// screen decides how long to wait before turning that into a request.
// The delays actually used: 300ms for the Orders column filters, 200ms for
// the tracker and Order-status search, 250ms for the CRM lists.
//
// The debounce deliberately lives HERE (in the screen) rather than inside
// OrderFilters, so that a screen can react instantly to a filter change in
// its UI (showing the "active" dot, resetting to page 1) while delaying only
// the network call.

import * as React from "react";

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return debounced;
}
