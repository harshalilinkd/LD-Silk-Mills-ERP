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
  if (!report) return problem("That report does not exist.", 404);

  let viewer;
  try {
    viewer = await requireReport(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refused.";
    // 401 means "we do not know who you are", 403 means "we do and you may
    // not". Answering a signed-out request 403 tells them to stop trying when
    // signing in is exactly what would work.
    return problem(message, message.includes("not signed in") ? 401 : 403);
  }

  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "csv" ? "csv" : "xlsx";

  // Only the keys this report declares, and only if they look right.
  const params: ReportParams = {};
  const from = q.get("from");
  const to = q.get("to");
  if (from && isIsoDate(from)) params.from = from;
  if (to && isIsoDate(to)) params.to = to;
  // A backwards range returns nothing and then announces a period that runs
  // backwards, which reads as "there is no data" rather than "you typed the
  // dates the wrong way round". The picker blocks it and the dashboards swap
  // it; this is the third entry point and it now does the same.
  if (params.from && params.to && params.from > params.to) {
    [params.from, params.to] = [params.to, params.from];
  }
  for (const f of report.filters) {
    if (f.kind === "dateRange") continue;
    const v = q.get(f.key);
    if (v && v.length <= 200) params[f.key] = v;
  }

  try {
    const result = await report.run(params);
    // The report ran and deliberately has nothing to hand over. Saying so beats
    // a file with one header row in it.
    if (result.notice) return problem(result.notice, 200);
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
      // Attachments, for the Receipts sheet. `requireReport` above is the
      // permission check they ride on — the same module access that lets this
      // person read the rows the receipts belong to.
      result.images,
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
    return problem("That report could not be produced. Please try a narrower period.", 500);
  }
}

/**
 * A readable page, not a JSON blob.
 *
 * The download is a top-level navigation — `window.location.href = …` — which
 * is right for a 50,000-row workbook and means the error BODY replaces the
 * Reports screen. `{"error":"You do not have access to Orders"}` on a white
 * page is not something anybody can act on, so this answers in a sentence with
 * the way back.
 */
function problem(message: string, status: number) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Report not produced</title>` +
      `<div style="font:15px/1.6 system-ui,sans-serif;max-width:34rem;margin:18vh auto;padding:0 1.5rem;color:#16181d">` +
      `<h1 style="font-size:19px;margin:0 0 .5rem">That report was not produced</h1>` +
      `<p style="margin:0 0 1.25rem;color:#464b56">${esc(message)}</p>` +
      `<a href="/reports" style="color:#2d3f8f">Back to Reports</a></div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
