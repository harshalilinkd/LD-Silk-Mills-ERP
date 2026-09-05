import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveChecklistViewer } from "@/lib/checklist/authz";
import { isIsoDate, type IsoDate } from "@/lib/checklist/dates";
import { isFrequency, type Frequency } from "@/lib/checklist/frequency";
import {
  getFilterOptions,
  getMasterPage,
} from "@/lib/checklist/master-query";
import { OCCURRENCE_STATUSES, type OccurrenceStatus } from "@/lib/checklist/status";
import { MasterScreen } from "./master-screen";

export const metadata: Metadata = {
  title: "Master Checklist — LD Silk Mills ERP",
};

const PAGE_SIZE = 100;

/**
 * The Master Checklist — the screen everybody has.
 *
 * ── THE MEMBER SCOPE IS APPLIED HERE, NOT IN THE COMPONENT ───────────────
 *
 * A non-admin gets `scopeDoerId` set to their own row and there is no
 * search-parameter that can change it. Passing a `doer` in the URL as a member
 * does nothing at all — it is read into `doerId`, which the query ignores the
 * moment `scopeDoerId` is present. That is the shape on purpose: the filter a
 * member can set and the scope they cannot are different fields, so no future
 * edit can accidentally let one become the other.
 *
 * ── FILTERS LIVE IN THE URL ──────────────────────────────────────────────
 *
 * So a filtered view can be sent to somebody, survives a refresh, and comes
 * back correctly from the browser's Back button — the last of which is what
 * makes the four count cards usable as filters at all.
 *
 * Defaults to today's work, exactly as theirs does. A checklist that opens on
 * eleven thousand rows is a checklist nobody reads.
 */
export default async function MasterPage({
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

  const statusRaw = one("status");
  const status: OccurrenceStatus | null =
    statusRaw && (OCCURRENCE_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as OccurrenceStatus)
      : statusRaw === "all"
        ? null
        : "Today"; // the default view, and what the count cards toggle off

  const freqRaw = one("freq");
  const frequency: Frequency | null = freqRaw && isFrequency(freqRaw) ? freqRaw : null;

  const fromRaw = one("from");
  const toRaw = one("to");
  const from: IsoDate | null = fromRaw && isIsoDate(fromRaw) ? fromRaw : null;
  const to: IsoDate | null = toRaw && isIsoDate(toRaw) ? toRaw : null;

  const doerRaw = one("doer");
  const doerId = doerRaw && /^\d+$/.test(doerRaw) ? Number(doerRaw) : null;

  const pageRaw = one("page");
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1;

  const filters = {
    // The one line that matters. A member is pinned to themselves.
    scopeDoerId: viewer.isAdmin ? null : viewer.doerId,
    doerId,
    department: one("dept"),
    taskSearch: one("q"),
    frequency,
    status,
    from,
    to,
  };

  // A member who is not on the doers list has no work — and no business
  // seeing anybody else's. `scopeDoerId` of null would mean "everything", so
  // this case is answered before the query rather than by it.
  if (!viewer.isAdmin && viewer.doerId == null) {
    return (
      <MasterScreen
        data={{
          rows: [],
          total: 0,
          today: new Date().toISOString().slice(0, 10),
          counts: { Today: 0, Delayed: 0, Done: 0, "Upcoming Focus": 0 },
        }}
        people={[]}
        departments={[]}
        page={1}
        pageSize={PAGE_SIZE}
        notOnList
      />
    );
  }

  const data = await getMasterPage(filters, page, PAGE_SIZE);
  const options = viewer.isAdmin
    ? await getFilterOptions()
    : { people: [], departments: [] };

  return (
    <MasterScreen
      data={data}
      people={options.people}
      departments={options.departments}
      page={page}
      pageSize={PAGE_SIZE}
    />
  );
}
