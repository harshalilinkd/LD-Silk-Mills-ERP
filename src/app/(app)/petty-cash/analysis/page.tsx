import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { endOfMonth, isIsoDate, startOfMonth, todayIso } from "@/lib/dates";
import { resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import {
  getActiveYears,
  getDailyTotals,
  getMonthlySummary,
  getMonthlyTrend,
  getPayeesWithUse,
  getTotals,
} from "@/lib/petty-cash/queries";
import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = {
  title: "Petty Cash analysis — LD Silk Mills ERP",
};

/** Months of history the cash-flow chart shows — a half-year, the way a
 * management pack's trend line usually runs. */
const TREND_MONTHS = 6;

/**
 * The month, several ways at once: the headline figures, six months of trend,
 * where it went, who it went to, and the day-by-day calendar.
 *
 * Every aggregate runs in SQL — one row per day, per month, per category —
 * rather than fetching entries and adding them up in the browser. The calendar
 * fills its own empty days, which is cheaper than making Postgres generate a
 * series to return zeroes.
 *
 * SIX QUERIES, AWAITED IN TURN. The pool is five connections wide and
 * pipelined statements stall under the transaction pooler, so nothing here is
 * a `Promise.all`. It is the heaviest page in the module by some way; if it
 * ever feels slow, fold the trend and the summary into one statement rather
 * than making these concurrent.
 */
export default async function PettyCashAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) redirect("/");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const raw = one("month");
  const anchor = raw && isIsoDate(raw) ? raw : todayIso();
  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);

  const viewRaw = one("view");
  const view: "CREDIT" | "DEBIT" | "NET" =
    viewRaw === "CREDIT" || viewRaw === "DEBIT" ? viewRaw : "NET";

  const days = await getDailyTotals(from, to);
  const totals = await getTotals({ from, to });
  const years = await getActiveYears();
  const summary = await getMonthlySummary(from, to);
  const trend = await getMonthlyTrend(TREND_MONTHS);
  const payees = await getPayeesWithUse();

  return (
    <DashboardScreen
      days={days}
      totals={totals}
      from={from}
      to={to}
      view={view}
      years={years}
      today={todayIso()}
      summary={summary}
      trend={trend}
      payees={payees}
    />
  );
}
