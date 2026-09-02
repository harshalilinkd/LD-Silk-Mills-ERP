"use client";

// Month-by-month history + the dates the order book starts from. Ported from
// Order Entry's components/orders/use-months.ts, minus TanStack Query — this
// app has no query client, so the session cache is a plain module-level Map
// (the same shape src/components/order-entry/orders/use-lookups.ts uses).
//
// Two consumers share one response: the dashboard filter bar's "By month…"
// select and the monthly report table below it.
import { useEffect, useState } from "react";

import type { MonthlyReport } from "@/lib/order-entry/monthly-report";
import type { Department } from "@/lib/order-entry/dashboard";

const cache = new Map<string, MonthlyReport>();
const inflight = new Map<string, Promise<MonthlyReport | null>>();

// The report only changes when an order is added, so it is held for the
// session rather than refetched per navigation — but the dashboard's manual
// refresh has to mean "refetch everything", not "everything except this".
let epoch = 0;
const listeners = new Set<() => void>();

export function clearMonthlyReportCache(): void {
  cache.clear();
  epoch += 1;
  for (const l of listeners) l();
}

async function fetchReport(url: string): Promise<MonthlyReport | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  const pending = inflight.get(url);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => null)) as {
        data?: MonthlyReport;
      } | null;
      if (!res.ok || !body?.data || !Array.isArray(body.data.months)) return null;
      // Only a good response is cached — a transient failure stays retryable.
      cache.set(url, body.data);
      return body.data;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}

export function useMonthlyReport(department: Department = "ALL"): {
  report: MonthlyReport | null;
  loading: boolean;
} {
  const url = `/api/order-entry/reports/monthly?department=${department}`;
  const [report, setReport] = useState<MonthlyReport | null>(
    () => cache.get(url) ?? null,
  );
  const [loading, setLoading] = useState(() => !cache.has(url));
  // Re-runs the effect below when clearMonthlyReportCache() bumps the epoch,
  // so every mounted consumer refetches together.
  const [tick, setTick] = useState(epoch);

  useEffect(() => {
    const onCleared = () => setTick(epoch);
    listeners.add(onCleared);
    return () => {
      listeners.delete(onCleared);
    };
  }, []);

  useEffect(() => {
    const cached = cache.get(url);
    if (cached) {
      setReport(cached);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchReport(url).then((r) => {
      if (!alive) return;
      setReport(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [url, tick]);

  return { report, loading };
}
