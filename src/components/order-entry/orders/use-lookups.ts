"use client";

// Autocomplete sources for the order form. Ported from Order Entry's
// components/orders/use-lookups.ts, minus TanStack Query — this app has no
// query client, so the session cache is a plain module-level Map (the lists are
// small, rarely change, and are only ever suggestions).
//
// These are SUGGESTIONS ONLY: an unknown party / fabric / design is never
// blocked, and the API adds a genuinely new value to the master list on save.
import { useEffect, useState } from "react";

export type LookupCategory =
  | "PARTY"
  | "SALES_PERSON"
  | "AGENT"
  | "HASTE"
  | "TRANSPORT"
  | "FABRIC";

// url -> values. Cached for the lifetime of the page; `inflight` de-dupes the
// concurrent fetches every design row would otherwise fire for the same fabric.
const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

async function fetchValues(url: string): Promise<string[]> {
  const cached = cache.get(url);
  if (cached) return cached;
  const pending = inflight.get(url);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
      if (!res.ok || !Array.isArray(body?.data)) return [];
      const values = body.data.filter((v): v is string => typeof v === "string");
      // Only a good response is cached — a transient failure must stay retryable.
      cache.set(url, values);
      return values;
    } catch {
      return [];
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}

function useRemoteValues(url: string): string[] {
  const [values, setValues] = useState<string[]>(() => cache.get(url) ?? []);

  useEffect(() => {
    const cached = cache.get(url);
    if (cached) {
      setValues(cached);
      return;
    }
    let alive = true;
    void fetchValues(url).then((v) => {
      if (alive) setValues(v);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return values;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Master-list values for one lookup category (party, fabric, agent, …). */
export function useLookup(category: LookupCategory): string[] {
  return useRemoteValues(`/api/order-entry/lookups?category=${category}`);
}

/**
 * Distinct design numbers from the Design Database, scoped to a fabric when one
 * is given (an empty fabric falls back to the most recent designs overall). The
 * fabric is debounced so typing it doesn't fire a request per keystroke.
 */
export function useDesigns(fabric: string): string[] {
  const debouncedFabric = useDebouncedValue(fabric.trim(), 350);
  return useRemoteValues(
    debouncedFabric
      ? `/api/order-entry/designs?fabric=${encodeURIComponent(debouncedFabric)}`
      : "/api/order-entry/designs",
  );
}
