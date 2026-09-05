import { NextResponse, type NextRequest } from "next/server";

import { resolveChecklistViewer } from "@/lib/checklist/authz";
import {
  endOfMonth,
  formatDate,
  isIsoDate,
  startOfMonth,
  todayIso,
  type IsoDate,
} from "@/lib/checklist/dates";
import { FREQUENCY_META } from "@/lib/checklist/frequency";
import { getScorecard } from "@/lib/checklist/scorecard-query";
import { deriveStatus } from "@/lib/checklist/status";

/**
 * The scorecard, as a spreadsheet.
 *
 * ── THE PERMISSION IS RE-CHECKED HERE, NOT INHERITED ─────────────────────
 *
 * A route handler is reachable directly by URL. It sits under the module's
 * layout in the file tree, but a layout does not run for a route handler — so
 * the "admins may see anybody, everybody else may see only themselves" rule is
 * enforced again, from scratch, in this file. Without it this endpoint would be
 * the one place a member could read a colleague's performance record simply by
 * changing a number in the address bar.
 *
 * ── WHY THE ROWS AND NOT THE SUMMARY ─────────────────────────────────────
 *
 * The screen already shows the summary. What a spreadsheet is for is the
 * working underneath it — one line per dated duty, with the planned date, the
 * date it was actually ticked, and how many days between. Somebody who
 * disagrees with a figure can then check it rather than take it.
 */
export async function GET(req: NextRequest) {
  const viewer = await resolveChecklistViewer();
  if (!viewer) {
    return new NextResponse("You do not have access to the Checklist.", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const today = todayIso();

  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from: IsoDate = fromRaw && isIsoDate(fromRaw) ? fromRaw : startOfMonth(today);
  const to: IsoDate = toRaw && isIsoDate(toRaw) ? toRaw : endOfMonth(today);

  // The whole access rule, again. A member's id comes from their session; the
  // `doer` parameter is not consulted on that path at all.
  let doerId: number | null;
  if (viewer.isAdmin) {
    const raw = sp.get("doer");
    doerId = raw && /^\d+$/.test(raw) ? Number(raw) : viewer.doerId;
  } else {
    doerId = viewer.doerId;
  }
  if (doerId == null) {
    return new NextResponse("Nothing to export.", { status: 404 });
  }

  const card = await getScorecard(doerId, from, to);
  if (!card) return new NextResponse("Not found.", { status: 404 });

  const k = card.kpis;
  const lines: string[] = [];

  // A short header block, so the file still means something six months later
  // when nobody remembers which period it covered.
  lines.push(csv(["Scorecard", card.doer.name]));
  lines.push(csv(["Department", card.doer.department ?? ""]));
  lines.push(csv(["Period", `${formatDate(from)} to ${formatDate(to)}`]));
  lines.push(csv(["Scheduled", String(k.total)]));
  lines.push(csv(["Come round so far", String(k.due)]));
  lines.push(csv(["Ticked off", String(k.done)]));
  lines.push(csv(["On time", String(k.onTime)]));
  lines.push(csv(["Late", String(k.late)]));
  lines.push(csv(["Still open, day passed", String(k.delayed)]));
  lines.push(csv(["On-time % (of those ticked off)", k.onTimePct === null ? "" : String(k.onTimePct)]));
  lines.push(csv(["Completed % (of those come round)", k.completionPct === null ? "" : String(k.completionPct)]));
  lines.push(csv(["Average days late (of those finished late)", String(k.avgDelay)]));
  lines.push(csv(["Best run on time", String(k.bestStreak)]));
  lines.push(csv(["Score out of 100", k.reliability === null ? "" : String(k.reliability)]));
  lines.push("");

  lines.push(csv(["Task", "How often", "Planned", "Actually done", "Days late", "Status"]));
  for (const r of card.rows) {
    const status = deriveStatus(
      { status: r.status, plannedDate: r.plannedDate, frequency: r.frequency },
      card.today,
    );
    const late =
      r.actualDate && r.actualDate > r.plannedDate
        ? String(
            Math.round(
              (Date.parse(`${r.actualDate}T00:00:00Z`) -
                Date.parse(`${r.plannedDate}T00:00:00Z`)) /
                86_400_000,
            ),
          )
        : "";
    lines.push(
      csv([
        r.taskName,
        FREQUENCY_META[r.frequency].label,
        formatDate(r.plannedDate),
        r.actualDate ? formatDate(r.actualDate) : "",
        late,
        status,
      ]),
    );
  }

  const filename = `checklist-${slug(card.doer.name)}-${from}-to-${to}.csv`;

  return new NextResponse(
    // Excel opens a UTF-8 CSV as the system codepage unless it finds a byte
    // order mark, which turns every name with an accent into mojibake.
    "﻿" + lines.join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

/** Quote anything that could break a cell, and double any quote inside it. */
function csv(fields: string[]): string {
  return fields
    .map((f) => {
      const s = f ?? "";
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "doer";
}
