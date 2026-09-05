import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, occurrences } from "@/db/checklist/schema";
import {
  addDays,
  daysBetween,
  endOfMonth,
  monthLabel,
  startOfMonth,
  todayIso,
  type IsoDate,
} from "./dates";
import type { Frequency } from "./frequency";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  One person's scorecard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── TWO QUERIES, AND THE REST IS ARITHMETIC ──────────────────────────────
 *
 * Unlike the dashboard, this one fetches rows and computes in JavaScript. That
 * is the right trade HERE and not there: this is one person over about seven
 * months, which is a few hundred rows, and the screen wants eight different
 * cuts of the same set — a heatmap, a six-month trend, a weekday pattern, per
 * task, per frequency, streaks. Eight grouped queries against the same rows,
 * over a pool of five connections, would be slower and far easier to let drift
 * out of agreement with each other.
 *
 * ── WHAT "RELIABILITY" IS, AND WHERE IT DIFFERS FROM THE ORIGINAL ────────
 *
 * A single 0–100 number, weighted: half on-time %, three-tenths how much of
 * the due work got done, two-tenths the best run of consecutive on-time
 * finishes (a thirty-day run scoring full marks).
 *
 * The one departure: the original's throughput term is `done ÷ everything
 * scheduled`, INCLUDING dates that have not arrived yet. That makes the score
 * climb through a month for no reason other than time passing, and start every
 * month near zero. Here the denominator is only what has actually come round.
 * It is the same correction the dashboard's completion figure makes, and the
 * screen prints the rule beside the number.
 *
 * It is a summary, not a verdict, and the screen says so. A composite that
 * gets used to judge somebody should be legible enough to argue with.
 */

export type ScorecardRow = {
  plannedDate: IsoDate;
  actualDate: IsoDate | null;
  status: "Scheduled" | "Done";
  taskId: number;
  taskName: string;
  frequency: Frequency;
};

export type Kpis = {
  total: number;
  /** Rows whose planned date has arrived — the honest denominator. */
  due: number;
  done: number;
  onTime: number;
  late: number;
  delayed: number;
  onTimePct: number | null;
  completionPct: number | null;
  avgDelay: number;
  bestStreak: number;
  currentStreak: number;
  reliability: number | null;
};

export type DayCell = {
  date: IsoDate;
  total: number;
  done: number;
  onTime: number;
  late: number;
  /** Open rows whose day has passed. */
  overdue: number;
  avgDelay: number;
};

export type Scorecard = {
  doer: { id: number; name: string; email: string; department: string | null };
  period: { from: IsoDate; to: IsoDate; days: number };
  previous: { from: IsoDate; to: IsoDate };
  today: IsoDate;
  kpis: Kpis;
  previousKpis: Kpis;
  trend: { month: string; label: string; onTimePct: number | null; done: number; total: number }[];
  days: DayCell[];
  weekdays: { weekday: number; label: string; total: number; onTimePct: number | null }[];
  byFrequency: { frequency: Frequency; total: number; onTime: number; late: number; open: number }[];
  topTasks: { taskId: number; name: string; count: number; done: number; donePct: number }[];
  bestTasks: { taskId: number; name: string; count: number; onTimePct: number }[];
  worstTasks: { taskId: number; name: string; count: number; onTimePct: number }[];
  rows: ScorecardRow[];
};

/** A task needs this many occurrences before it is ranked best or worst. */
const MIN_SAMPLES_TO_RANK = 3;

function computeKpis(rows: ScorecardRow[], today: IsoDate): Kpis {
  const total = rows.length;
  const due = rows.filter((r) => r.plannedDate <= today).length;
  const done = rows.filter((r) => r.status === "Done").length;
  const onTime = rows.filter(
    (r) => r.status === "Done" && r.actualDate != null && r.actualDate <= r.plannedDate,
  ).length;
  const lateRows = rows.filter(
    (r) => r.status === "Done" && r.actualDate != null && r.actualDate > r.plannedDate,
  );
  const delayed = rows.filter(
    (r) => r.status !== "Done" && r.plannedDate < today,
  ).length;

  const avgDelay = lateRows.length
    ? Math.round(
        (lateRows.reduce((s, r) => s + daysBetween(r.plannedDate, r.actualDate!), 0) /
          lateRows.length) *
          10,
      ) / 10
    : 0;

  // Streaks run over COMPLETED rows in planned-date order. A row not yet done
  // does not break a streak — it has not happened — but a late one does.
  const completed = rows
    .filter((r) => r.status === "Done" && r.actualDate)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  let best = 0;
  let running = 0;
  for (const r of completed) {
    if (r.actualDate! <= r.plannedDate) {
      running++;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }

  const onTimePct = done === 0 ? null : Math.round((onTime / done) * 100);
  const completionPct = due === 0 ? null : Math.round((done / due) * 100);
  const streakScore = Math.min(100, (best / 30) * 100);

  return {
    total,
    due,
    done,
    onTime,
    late: lateRows.length,
    delayed,
    onTimePct,
    completionPct,
    avgDelay,
    bestStreak: best,
    currentStreak: running,
    reliability:
      onTimePct === null && completionPct === null
        ? null
        : Math.round(
            0.5 * (onTimePct ?? 0) + 0.3 * (completionPct ?? 0) + 0.2 * streakScore,
          ),
  };
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getScorecard(
  doerId: number,
  from: IsoDate,
  to: IsoDate,
): Promise<Scorecard | null> {
  const today = todayIso();

  const [doer] = await checklistDb
    .select({
      id: doers.id,
      name: doers.name,
      email: doers.email,
      department: doers.department,
    })
    .from(doers)
    .where(eq(doers.id, doerId))
    .limit(1);
  if (!doer) return null;

  const days = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  // The six-month trend reaches further back than the previous period might,
  // so the single fetch covers whichever window starts earliest.
  const trendStart = startOfMonth(monthsBack(to, 5));
  const fetchFrom = [prevFrom, trendStart].sort()[0];

  const all = (await checklistDb
    .select({
      plannedDate: occurrences.plannedDate,
      actualDate: occurrences.actualDate,
      status: occurrences.status,
      taskId: occurrences.taskId,
      taskName: occurrences.taskName,
      frequency: occurrences.frequency,
    })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.doerId, doerId),
        gte(occurrences.plannedDate, fetchFrom),
        lte(occurrences.plannedDate, to),
      ),
    )
    .orderBy(asc(occurrences.plannedDate))) as ScorecardRow[];

  const inPeriod = all.filter((r) => r.plannedDate >= from && r.plannedDate <= to);
  const inPrev = all.filter((r) => r.plannedDate >= prevFrom && r.plannedDate <= prevTo);

  // ── six-month trend ────────────────────────────────────────────────────
  const trend: Scorecard["trend"] = [];
  for (let i = 5; i >= 0; i--) {
    const anchor = monthsBack(to, i);
    const ms = startOfMonth(anchor);
    const me = endOfMonth(anchor);
    const rows = all.filter((r) => r.plannedDate >= ms && r.plannedDate <= me);
    const k = computeKpis(rows, today);
    trend.push({
      month: ms.slice(0, 7),
      label: monthLabel(ms),
      onTimePct: k.onTimePct,
      done: k.done,
      total: k.total,
    });
  }

  // ── the heatmap ────────────────────────────────────────────────────────
  const byDate = new Map<IsoDate, ScorecardRow[]>();
  for (const r of inPeriod) {
    const list = byDate.get(r.plannedDate);
    if (list) list.push(r);
    else byDate.set(r.plannedDate, [r]);
  }

  const cells: DayCell[] = [];
  // Every day in the range, including the empty ones — a heatmap with holes
  // where nothing was scheduled reads as a calendar; one that skips them reads
  // as a bar chart and loses the weekly rhythm entirely.
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rows = byDate.get(d) ?? [];
    const done = rows.filter((r) => r.status === "Done");
    const onTime = done.filter((r) => r.actualDate! <= r.plannedDate).length;
    const lateRows = done.filter((r) => r.actualDate! > r.plannedDate);
    cells.push({
      date: d,
      total: rows.length,
      done: done.length,
      onTime,
      late: lateRows.length,
      overdue: rows.filter((r) => r.status !== "Done" && r.plannedDate < today).length,
      avgDelay: lateRows.length
        ? Math.round(
            (lateRows.reduce((s, r) => s + daysBetween(r.plannedDate, r.actualDate!), 0) /
              lateRows.length) *
              10,
          ) / 10
        : 0,
    });
  }

  // ── weekday pattern ────────────────────────────────────────────────────
  const weekdays = WEEKDAY_LABELS.map((label, weekday) => {
    const rows = inPeriod.filter(
      (r) => new Date(`${r.plannedDate}T00:00:00Z`).getUTCDay() === weekday,
    );
    const k = computeKpis(rows, today);
    return { weekday, label, total: rows.length, onTimePct: k.onTimePct };
  });

  // ── by frequency ───────────────────────────────────────────────────────
  const freqMap = new Map<Frequency, { total: number; onTime: number; late: number; open: number }>();
  for (const r of inPeriod) {
    const e = freqMap.get(r.frequency) ?? { total: 0, onTime: 0, late: 0, open: 0 };
    e.total++;
    if (r.status === "Done" && r.actualDate) {
      if (r.actualDate <= r.plannedDate) e.onTime++;
      else e.late++;
    } else {
      e.open++;
    }
    freqMap.set(r.frequency, e);
  }
  const byFrequency = [...freqMap.entries()]
    .map(([frequency, v]) => ({ frequency, ...v }))
    .sort((a, b) => b.total - a.total);

  // ── by task ────────────────────────────────────────────────────────────
  const taskMap = new Map<number, { name: string; count: number; done: number; onTime: number }>();
  for (const r of inPeriod) {
    const e = taskMap.get(r.taskId) ?? { name: r.taskName, count: 0, done: 0, onTime: 0 };
    e.count++;
    if (r.status === "Done") {
      e.done++;
      if (r.actualDate && r.actualDate <= r.plannedDate) e.onTime++;
    }
    taskMap.set(r.taskId, e);
  }

  const tasksList = [...taskMap.entries()].map(([taskId, v]) => ({
    taskId,
    name: v.name,
    count: v.count,
    done: v.done,
    onTime: v.onTime,
    donePct: v.count ? Math.round((v.done / v.count) * 100) : 0,
    onTimePct: v.count ? Math.round((v.onTime / v.count) * 100) : 0,
  }));

  const topTasks = [...tasksList]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(({ taskId, name, count, done, donePct }) => ({ taskId, name, count, done, donePct }));

  // Ranked only among tasks with enough occurrences to mean anything. A task
  // that came round once and was missed is not somebody's worst duty, it is
  // one data point — and the original ranks it as if it were.
  const rankable = tasksList.filter((t) => t.count >= MIN_SAMPLES_TO_RANK);
  const bestTasks = [...rankable]
    .sort((a, b) => b.onTimePct - a.onTimePct || b.count - a.count)
    .slice(0, 3)
    .map(({ taskId, name, count, onTimePct }) => ({ taskId, name, count, onTimePct }));
  const worstTasks = [...rankable]
    .sort((a, b) => a.onTimePct - b.onTimePct || b.count - a.count)
    .slice(0, 3)
    .map(({ taskId, name, count, onTimePct }) => ({ taskId, name, count, onTimePct }));

  return {
    doer,
    period: { from, to, days },
    previous: { from: prevFrom, to: prevTo },
    today,
    kpis: computeKpis(inPeriod, today),
    previousKpis: computeKpis(inPrev, today),
    trend,
    days: cells,
    weekdays,
    byFrequency,
    topTasks,
    bestTasks,
    worstTasks,
    rows: inPeriod,
  };
}

/** `n` whole months before the month `iso` falls in, on the 1st. */
function monthsBack(iso: IsoDate, n: number): IsoDate {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
}
