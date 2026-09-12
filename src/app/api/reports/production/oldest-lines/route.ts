import { NextResponse, type NextRequest } from "next/server";

import { isIsoDate } from "@/lib/dates";
import { canRunModule, resolveReportViewer } from "@/lib/reports/authz";
import { sortedPendingRows } from "@/lib/reports/dashboards/order-entry";
import { productionStatus } from "@/lib/reports/order-entry/production-status";
import type { ReportParams } from "@/lib/reports/types";

/**
 * `GET /api/reports/production/oldest-lines?from=…&to=…&party=…&agent=…&page=…`
 *
 * The Production dashboard's "Oldest open lines" card only ever showed the
 * top fifteen, with a note pointing at the downloadable report for the rest.
 * This is the same list, paged, for the "view all" dialog on that card — a
 * route handler runs with no layout above it, so it re-resolves the viewer
 * and re-checks Orders access exactly like the export route does, rather
 * than trusting that the page which linked here already checked.
 *
 * It runs the SAME report (`productionStatus.run`) and the SAME sort
 * (`sortedPendingRows`) the dashboard's own top-fifteen uses, so page 1 here
 * is never a different fifteen than the card already showed.
 */
const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const viewer = await resolveReportViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canRunModule(viewer, "order-entry")) {
    return NextResponse.json(
      { error: "You do not have Orders." },
      { status: 403 },
    );
  }

  const q = req.nextUrl.searchParams;
  const params: ReportParams = {};
  const from = q.get("from");
  const to = q.get("to");
  if (from && isIsoDate(from)) params.from = from;
  if (to && isIsoDate(to)) params.to = to;
  if (params.from && params.to && params.from > params.to) {
    [params.from, params.to] = [params.to, params.from];
  }
  const party = q.get("party");
  if (party && party.length <= 200) params.party = party;
  const agent = q.get("agent");
  if (agent && agent.length <= 200) params.agent = agent;

  const requestedPage = Number.parseInt(q.get("page") ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const prod = await productionStatus.run(params);
  const openRows = prod.rows.filter((r) => r.open === true);
  const all = sortedPendingRows(openRows);
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const rows = all.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  return NextResponse.json({
    rows,
    total: all.length,
    page: clampedPage,
    pageSize: PAGE_SIZE,
    totalPages,
  });
}
