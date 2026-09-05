import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveChecklistViewer } from "@/lib/checklist/authz";
import { getDashboard } from "@/lib/checklist/dashboard-query";
import { isIsoDate, type IsoDate } from "@/lib/checklist/dates";
import { getFilterOptions } from "@/lib/checklist/master-query";
import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = {
  title: "Checklist — LD Silk Mills ERP",
};

/**
 * The Checklist dashboard.
 *
 * ── IT IS NOT ADMIN-ONLY, BUT IT IS SCOPED ───────────────────────────────
 *
 * Their version of this screen is administrators-only. This one is not: a
 * member gets the same shape, scoped to themselves, because "how am I doing"
 * is a reasonable question to be able to answer about your own work without
 * asking somebody. What a member does NOT get is anybody else's figures —
 * `scopeDoerId` pins the whole page, the department breakdown collapses to
 * their own, and the "delayed by doer" list is not rendered at all.
 */
export default async function ChecklistDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveChecklistViewer();
  if (!viewer) redirect("/login");

  const sp = await searchParams;
  const one = (k: string): string | null => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };

  const fromRaw = one("from");
  const toRaw = one("to");
  const from: IsoDate | null = fromRaw && isIsoDate(fromRaw) ? fromRaw : null;
  const to: IsoDate | null = toRaw && isIsoDate(toRaw) ? toRaw : null;

  const doerRaw = one("doer");
  const doerId = doerRaw && /^\d+$/.test(doerRaw) ? Number(doerRaw) : null;

  if (!viewer.isAdmin && viewer.doerId == null) {
    return <DashboardScreen data={null} people={[]} departments={[]} />;
  }

  const data = await getDashboard({
    scopeDoerId: viewer.isAdmin ? null : viewer.doerId,
    doerId,
    department: one("dept"),
    from,
    to,
  });

  const options = viewer.isAdmin
    ? await getFilterOptions()
    : { people: [], departments: [] };

  return (
    <DashboardScreen
      data={data}
      people={options.people}
      departments={options.departments}
    />
  );
}
