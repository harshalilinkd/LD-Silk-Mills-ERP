import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { endOfMonth, isIsoDate, startOfMonth, todayIso } from "@/lib/dates";
import { resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import { getActiveYears, getMonthlySummary } from "@/lib/petty-cash/queries";
import { SummaryScreen } from "./summary-screen";

export const metadata: Metadata = {
  title: "Petty Cash summary — LD Silk Mills ERP",
};

/**
 * One month, totalled and broken down.
 *
 * The month is a search parameter so a particular month can be linked to and
 * comes back from the Back button. `month` is the FIRST of the month, which is
 * also what the query wants, so nothing has to reconstruct a date from two
 * numbers.
 */
export default async function PettyCashSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) redirect("/");

  const sp = await searchParams;
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const anchor = raw && isIsoDate(raw) ? raw : todayIso();

  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);

  const summary = await getMonthlySummary(from, to);
  const years = await getActiveYears();

  return <SummaryScreen summary={summary} years={years} today={todayIso()} />;
}
