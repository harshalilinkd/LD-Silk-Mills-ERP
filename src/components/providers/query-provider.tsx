"use client";

// TanStack Query for the whole authenticated app (docs/SCREENS.md §0.1).
// Mounted once in src/app/(app)/layout.tsx so every module screen —
// Order Entry, CRM, and anything added later — can call useQuery without
// wiring its own provider.

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 30s of freshness: long enough that switching between the Orders
        // table and the tracking view (the same data, two screens) does not
        // refire the request, short enough that a stage update shows up.
        staleTime: 30_000,
        // These screens are dense tables people leave open next to a
        // spreadsheet; refetching every time the window regains focus made
        // rows shuffle under the cursor.
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Lazy state initialiser, NOT a module-level singleton: on the server a
  // singleton would be shared between concurrent requests and leak one
  // user's cache into another's render. useState also guarantees the client
  // keeps one client across re-renders (a plain `new QueryClient()` in the
  // body would throw the cache away on every render).
  const [client] = React.useState(makeQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
