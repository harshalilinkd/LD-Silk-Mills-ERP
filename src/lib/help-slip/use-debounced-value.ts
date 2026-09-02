"use client";

import * as React from "react";

/**
 * Hold a value still for `delay` ms.
 *
 * 300ms on every Help Slip search box, matching the standalone app. Live as
 * you type: a slow round trip must never read as "press Enter", and firing a
 * request per keystroke would put fifteen queries through a five-connection
 * pool for one search.
 *
 * A local copy rather than an import of
 * `@/components/order-entry/shared/use-debounced-value`: identical eight
 * lines, but reaching across module boundaries for it would make Help Slip
 * depend on a file the Orders spec owns and is free to change.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
