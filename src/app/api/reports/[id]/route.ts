import { NextResponse, type NextRequest } from "next/server";

import { isIsoDate } from "@/lib/dates";
import { requireReport } from "@/lib/reports/authz";
import { fileName, toCsv } from "@/lib/reports/csv";
import { getReport } from "@/lib/reports/registry";
import type { ReportParams } from "@/lib/reports/types";
import { toWorkbook } from "@/lib/reports/xlsx";

/**
 * `GET /api/reports/{id}?format=csv|xlsx&from=…&to=…&party=…`
 *
 * The one way a report leaves the building.
 *
 * ── IT RE-AUTHORISES FROM SCRATCH ────────────────────────────────────────
 *
 * A route handler runs with no layout above it, so the fact that the Reports
 * page decided this person may see a report proves nothing here — the page is
 * not in the request path. `requireReport` resolves the session and re-reads
 * `system_access` before a single parameter is looked at. It is the same rule
 * the Checklist's CSV export follows and for the same reason.
 *
 * ── EVERY PARAMETER IS RE-VALIDATED ──────────────────────────────────────
 *
 * Dates are checked against the ISO shape and dropped if they fail rather than
 * being passed to Postgres to argue about. Filter values are only accepted for
 * keys the report actually declares, so an extra query parameter cannot reach
 * the query. The queries themselves bind every value as a parameter.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const report = getReport(id);
  if (!report) {
    return NextResponse.json({ error: "That report does not exist." }, { status: 404 });
  }

  let viewer;
  try {
    viewer = await requireReport(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refused." },
      { status: 403 },
    );
  }

  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "csv" ? "csv" : "xlsx";

  // Only the keys this report declares, and only if they look right.
  const params: ReportParams = {};
  const from = q.get("from");
  const to = q.get("to");
  if (from && isIsoDate(from)) params.from = from;
  if (to && isIsoDate(to)) params.to = to;
  for (const f of report.filters) {
    if (f.kind === "dateRange") continue;
    const v = q.get(f.key);
    if (v && v.length <= 200) params[f.key] = v;
  }

  try {
    const result = await report.run(params);
    const truncated = result.rows.length < result.totalRows;
    const name = fileName(report.id, format, params.from, params.to, truncated);

    if (format === "csv") {
      const body = toCsv(report.columns, result.rows);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await toWorkbook(
      report,
      params,
      report.columns,
      result.rows,
      result.analysis,
      { runBy: `${viewer.name} (${viewer.email})`, runAt: new Date(), totalRows: result.totalRows },
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(`report ${id} failed:`, e);
    return NextResponse.json(
      { error: "That report could not be produced. Please try a narrower period." },
      { status: 500 },
    );
  }
}
