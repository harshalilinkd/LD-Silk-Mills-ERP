import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveChecklistViewer } from "@/lib/checklist/authz";
import {
  endOfMonth,
  isIsoDate,
  startOfMonth,
  todayIso,
  type IsoDate,
} from "@/lib/checklist/dates";
import { getFilterOptions } from "@/lib/checklist/master-query";
import { getScorecard } from "@/lib/checklist/scorecard-query";
import { ScorecardScreen } from "./scorecard-screen";

export const metadata: Metadata = {
  title: "Scorecards — LD Silk Mills ERP",
};

/**
 * Scorecards — one person's record over a period.
 *
 * ── THE ACCESS RULE IS THE STRICTEST IN THE MODULE ───────────────────────
 *
 * An administrator may look at anybody. Everybody else may look at exactly one
 * person: themselves. This is a performance record, and the `doer` search
 * parameter is IGNORED for a non-admin rather than validated — there is no
 * value they can put in the URL that changes whose card they get, because the
 * id is never taken from the URL on that path at all.
 */
export default async function ScorecardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveChecklistViewer();
  if (!viewer) redirect("/checklist");

  const sp = await searchParams;
  const one = (k: string): string | null => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };

  const today = todayIso();
  const fromRaw = one("from");
  const toRaw = one("to");
  const from: IsoDate = fromRaw && isIsoDate(fromRaw) ? fromRaw : startOfMonth(today);
  const to: IsoDate = toRaw && isIsoDate(toRaw) ? toRaw : endOfMonth(today);

  const options = viewer.isAdmin
    ? await getFilterOptions()
    : { people: [], departments: [] };

  // The whole rule, in one expression. A member's id comes from their session
  // and nowhere else.
  let doerId: number | null;
  if (viewer.isAdmin) {
    const raw = one("doer");
    doerId =
      raw && /^\d+$/.test(raw)
        ? Number(raw)
        : (viewer.doerId ?? options.people[0]?.id ?? null);
  } else {
    doerId = viewer.doerId;
  }

  if (doerId == null) {
    return (
      <ScorecardScreen
        data={null}
        people={options.people}
        from={from}
        to={to}
        reason={
          viewer.isAdmin
            ? "There is nobody on the doers list yet."
            : "You are not on the doers list yet, so there is nothing to measure."
        }
      />
    );
  }

  const data = await getScorecard(doerId, from, to);

  return (
    <ScorecardScreen
      data={data}
      people={options.people}
      from={from}
      to={to}
      reason={data ? undefined : "That person is no longer on the list."}
    />
  );
}
