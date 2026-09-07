import "server-only";

import { addMonths, isIsoDate, startOfMonth, todayIso } from "@/lib/dates";
import { distinctValues } from "@/lib/reports/order-entry/shared";
import type { ReportParams } from "@/lib/reports/types";

import type { Option } from "./dashboard-filters";

/**
 * What the two dashboard pages share: reading the slicers off the URL and
 * fetching the two dropdowns.
 *
 * ── EVERY PARAMETER IS VALIDATED HERE, NOT TRUSTED ───────────────────────
 *
 * These values reach SQL through the reports' own parameterised queries, so a
 * bad one cannot inject anything — but a bad date silently becomes "no filter"
 * and the screen then shows a wider period than the one it prints at the top,
 * which is its own kind of wrong figure. An unparseable date falls back to the
 * default window and the header says which window is being shown.
 */

/** Twelve months back to today — a year is the shortest period a trend means anything over. */
export const DEFAULT_MONTHS_BACK = 12;

export type DashboardParams = {
  params: ReportParams;
  from: string;
  to: string;
  party?: string;
  agent?: string;
};

export function readParams(sp: Record<string, string | string[] | undefined>): DashboardParams {
  const one = (k: string): string | undefined => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length <= 200 ? s : undefined;
  };

  const today = todayIso();
  const rawFrom = one("from");
  const rawTo = one("to");
  const from = rawFrom && isIsoDate(rawFrom) ? rawFrom : startOfMonth(addMonths(today, -(DEFAULT_MONTHS_BACK - 1)));
  const to = rawTo && isIsoDate(rawTo) ? rawTo : today;
  const party = one("party");
  const agent = one("agent");

  return {
    // A backwards range would return nothing and look like "no data" rather
    // than "you typed the dates the wrong way round", so it is swapped.
    params: {
      from: from <= to ? from : to,
      to: from <= to ? to : from,
      ...(party ? { party } : {}),
      ...(agent ? { agent } : {}),
    },
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    party,
    agent,
  };
}

/**
 * The two dropdowns, awaited IN TURN. The pool is five connections wide and
 * pipelined statements stall under the transaction pooler — the same rule
 * every other screen in this ERP follows.
 */
export async function loadOptions(): Promise<{ parties: Option[]; agents: Option[] }> {
  const parties = await distinctValues("party_name");
  const agents = await distinctValues("agent");
  return { parties, agents };
}
