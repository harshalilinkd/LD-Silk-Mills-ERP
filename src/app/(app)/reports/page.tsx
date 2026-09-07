import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { addMonths, startOfMonth, todayIso } from "@/lib/dates";
import { canRunReport, resolveReportViewer } from "@/lib/reports/authz";
import { reportsByModule } from "@/lib/reports/registry";
import { MODULE_META } from "@/lib/reports/types";
import { ReportsScreen, type ModuleGroup, type ReportCard } from "./reports-screen";

export const metadata: Metadata = { title: "Reports — LD Silk Mills ERP" };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reports
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One place every module's reports come out of. A report inherits the
 * permission of the module it reports on — the owner's rule: whoever has been
 * given Orders can export all of Orders' reports.
 *
 * A report this person cannot run is not hidden. It is shown greyed with the
 * module that would unlock it, because a catalogue that silently shrinks makes
 * somebody think the report does not exist and ask for it to be built again.
 * The export route re-checks the same thing from scratch, so the greying is a
 * courtesy and never the boundary.
 *
 * ── FILTER OPTIONS ARE RESOLVED HERE, SEQUENTIALLY ───────────────────────
 *
 * Each `select` filter fetches its own distinct values. They are awaited in
 * turn: the pool is five connections wide and pipelined statements stall under
 * the transaction pooler, and a page offering four dropdowns would otherwise
 * fire four queries at once.
 */
export default async function ReportsPage() {
  const viewer = await resolveReportViewer();
  if (!viewer) redirect("/login");

  const groups = reportsByModule();
  const cards: ModuleGroup[] = [];

  for (const g of groups) {
    const reports: ReportCard[] = [];
    for (const r of g.reports) {
      const allowed = canRunReport(viewer, r);
      const filters = [];
      for (const f of r.filters) {
        filters.push({
          key: f.key,
          label: f.label,
          kind: f.kind,
          help: f.help,
          // Only for reports this person can actually run — the options are a
          // list of every customer name, which is data in its own right.
          options: allowed && f.options ? await f.options() : undefined,
        });
      }
      reports.push({
        id: r.id,
        title: r.title,
        description: r.description,
        columnCount: r.columns.length,
        allowed,
        lockedBy: allowed ? null : MODULE_META[r.module].label,
        defaultFrom: r.defaultMonthsBack
          ? startOfMonth(addMonths(todayIso(), -(r.defaultMonthsBack - 1)))
          : null,
        defaultTo: r.defaultMonthsBack ? todayIso() : null,
        filters,
      });
    }
    cards.push({ module: g.module, label: g.label, reports });
  }

  return <ReportsScreen groups={cards} today={todayIso()} />;
}
