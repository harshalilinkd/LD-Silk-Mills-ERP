import "server-only";

import { sql as pg } from "@/db";
import { todayIso } from "@/lib/dates";
import { fillMonths, rank, spread, trend } from "../analysis";
import { count, pct, plural } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";

/**
 * Checklist duty register — one row per duty on one day.
 *
 * ── ONE REPORT, ON THE OWNER'S INSTRUCTION AND ON THE MERITS ─────────────
 *
 * "For checklist 1 report is sufficient." It is: the Checklist has one fact
 * table, `occurrences`, and everything else about the module — scorecards,
 * completion, on-time — is a roll-up of it. A scorecard report and a task
 * report would be two views of this sheet, and the module's own Scorecards
 * screen already computes them live.
 *
 * ── TODAY / DELAYED / UPCOMING ARE DERIVED HERE, NEVER STORED ────────────
 *
 * Only `Scheduled` and `Done` are stored. Everything else is worked out from
 * the planned date at read time, which is the module's own rule and the reason
 * it is written down: a stored "Delayed" needs a nightly sweep to stay
 * truthful, and a night it did not run is a morning the whole checklist lies.
 *
 * ── THE TWO PERCENTAGES HAVE DIFFERENT DENOMINATORS, ON PURPOSE ──────────
 *
 * **On time** is of what was DONE. **Completion** is of what has COME ROUND.
 * The original app divided both by everything ever scheduled, which makes
 * completion climb through a month for no reason other than the calendar. A
 * figure that cannot be computed shows a dash here, never 0%.
 */
const SQL = `
  select
    o.occurrence_key,
    o.task_name,
    d.name        as doer,
    d.department,
    d.email       as doer_email,
    o.frequency::text as frequency,
    o.planned_date,
    o.actual_date,
    o.status::text    as status,
    t.assigned_by,
    t.notes,
    t.active      as task_active,
    o.created_at,
    o.updated_at
  from ld_checklist_system.occurrences o
  left join ld_checklist_system.doers d on d.id = o.doer_id
  left join ld_checklist_system.tasks t on t.id = o.task_id
  where ($1::date is null or o.planned_date >= $1::date)
    and ($2::date is null or o.planned_date <= $2::date)
    and ($3::text is null or d.name = $3::text)
    and ($4::text is null or o.frequency::text = $4::text)
    and ($5::text is null or o.status::text = $5::text)
  -- Newest planned first, then the task, then the key — the key is unique, so
  -- two runs of the same period produce the same file.
  order by o.planned_date desc, o.task_name, o.occurrence_key
`;

type Raw = {
  occurrence_key: string; task_name: string; doer: string | null; department: string | null;
  doer_email: string | null; frequency: string; planned_date: string; actual_date: string | null;
  status: string; assigned_by: string | null; notes: string | null; task_active: boolean | null;
  created_at: string; updated_at: string;
};

const FREQ: Record<string, string> = {
  D: "Daily",
  W: "Weekly",
  M: "Monthly",
  Q: "Quarterly",
  H: "Half yearly",
  Y: "Yearly",
};

const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [
    params.from ?? null,
    params.to ?? null,
    params.doer ?? null,
    params.frequency ?? null,
    params.status ?? null,
  ])) as unknown as Raw[];
  const today = todayIso();

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const planned = r.planned_date?.slice(0, 10) ?? "";
    const actual = r.actual_date?.slice(0, 10) ?? null;
    const done = r.status === "Done";
    const overdue = !done && planned && planned < today ? days(planned, today) : null;
    return {
      task_name: r.task_name,
      doer: r.doer,
      department: r.department,
      doer_email: r.doer_email,
      frequency: FREQ[r.frequency] ?? r.frequency,
      planned_date: planned || null,
      actual_date: actual,
      status: r.status,
      // Derived, never stored — see the header.
      state: done ? "Done" : planned === today ? "Due today" : overdue != null ? "Delayed" : "Upcoming",
      on_time: done && actual && planned ? actual <= planned : null,
      days_late: done && actual && planned ? Math.max(0, days(planned, actual)) : null,
      days_overdue: overdue,
      task_active: r.task_active,
      assigned_by: r.assigned_by,
      notes: r.notes,
      updated_at: r.updated_at,
    };
  });

  // ── the figures ─────────────────────────────────────────────────────────
  // ── HOW MANY DUTIES FELL IN EACH MONTH ────────────────────────────
  //
  // Filled across the period, so a month in which nothing was scheduled
  // shows as zero rather than vanishing from the axis. With one duty this is
  // what turns a single unplottable point into a line that honestly says
  // "one duty, one month, nothing either side".
  const byMonthPlanned = new Map<string, number>();
  const byMonthDone = new Map<string, number>();
  for (const r of raw) {
    const m = r.planned_date?.slice(0, 7);
    if (!m) continue;
    byMonthPlanned.set(m, (byMonthPlanned.get(m) ?? 0) + 1);
    if (r.status === "Done") byMonthDone.set(m, (byMonthDone.get(m) ?? 0) + 1);
  }
  const t = trend(fillMonths(byMonthPlanned, params), count);

  const done = raw.filter((r) => r.status === "Done");
  const comeRound = raw.filter((r) => (r.planned_date?.slice(0, 10) ?? "") <= today);
  const doneOfComeRound = comeRound.filter((r) => r.status === "Done");
  const onTime = done.filter(
    (r) => r.actual_date && r.planned_date && r.actual_date.slice(0, 10) <= r.planned_date.slice(0, 10),
  );
  const delayed = comeRound.filter((r) => r.status !== "Done");
  const lateness = spread(
    done
      .filter((r) => r.actual_date && r.planned_date)
      .map((r) => Math.max(0, days(r.planned_date.slice(0, 10), r.actual_date!.slice(0, 10)))),
  );

  const byDoer = new Map<string, number>();
  const doneByDoer = new Map<string, number>();
  const byFreq = new Map<string, number>();
  const byDept = new Map<string, number>();
  for (const r of raw) {
    const d = r.doer?.trim() || "Not assigned";
    byDoer.set(d, (byDoer.get(d) ?? 0) + 1);
    if (r.status === "Done") doneByDoer.set(d, (doneByDoer.get(d) ?? 0) + 1);
    byFreq.set(FREQ[r.frequency] ?? r.frequency, (byFreq.get(FREQ[r.frequency] ?? r.frequency) ?? 0) + 1);
    byDept.set(r.department?.trim() || "Not recorded", (byDept.get(r.department?.trim() || "Not recorded") ?? 0) + 1);
  }

  const insights: string[] = [];
  if (comeRound.length) {
    insights.push(
      `${count(doneOfComeRound.length)} of ${plural(comeRound.length, "duty", "duties")} that ${comeRound.length === 1 ? "has" : "have"} come round ${comeRound.length === 1 ? "is" : "are"} done — ${pct((doneOfComeRound.length / comeRound.length) * 100, 0)}. ${raw.length - comeRound.length === 0 ? "Nothing is still ahead." : plural(raw.length - comeRound.length, "duty", "duties") + " still ahead, not counted against anybody."}`,
    );
  }
  if (done.length) {
    insights.push(
      `${pct((onTime.length / done.length) * 100, 0)} of the ${plural(done.length, "completed duty", "completed duties")} ${done.length === 1 ? "was" : "were"} done on or before the planned day.`,
    );
  }
  if (delayed.length) {
    insights.push(
      `${plural(delayed.length, "duty", "duties")} ${delayed.length === 1 ? "is" : "are"} past ${delayed.length === 1 ? "its" : "their"} day and not ticked.`,
    );
  }
  if (lateness.n > 0 && lateness.max !== null && lateness.max > 0) {
    insights.push(
      `Where a duty was late, the middle one was ${lateness.median?.toFixed(0) ?? 0} days late and the worst was ${lateness.max.toFixed(0)}.`,
    );
  }
  if (raw.length > 0 && raw.length < 20) {
    insights.push(
      `Only ${plural(raw.length, "duty", "duties")} on record. The Checklist starts empty and is filled in this order — Doers, then Holidays, then Tasks — and each of those screens takes a paste from Excel. Everything above is true and thin until then.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: comeRound.length
        ? `${pct((doneOfComeRound.length / comeRound.length) * 100, 0)} of the duties that have come round are done.`
        : raw.length
          ? `${count(raw.length)} duties are scheduled and none has come round yet.`
          : "No duties scheduled in this period.",
      kpis: [
        { label: "Duties in the period", value: count(raw.length) },
        { label: "Come round", value: count(comeRound.length), sub: "planned on or before today" },
        { label: "Done", value: count(done.length), tone: "good" },
        {
          label: "Completion",
          value: comeRound.length ? pct((doneOfComeRound.length / comeRound.length) * 100, 0) : "—",
          tone: comeRound.length && doneOfComeRound.length / comeRound.length >= 0.9 ? "good" : "warn",
          sub: "of what has come round",
        },
        {
          label: "On time",
          value: done.length ? pct((onTime.length / done.length) * 100, 0) : "—",
          tone: done.length && onTime.length / done.length >= 0.9 ? "good" : "warn",
          sub: "of what was done",
        },
        { label: "Past their day", value: count(delayed.length), tone: delayed.length ? "bad" : "good", lowerIsBetter: true },
        { label: "Worst delay", value: lateness.max !== null && lateness.max > 0 ? `${lateness.max.toFixed(0)} d` : "—" },
        { label: "People with duties", value: count(byDoer.size) },
      ],
      trend: t.points.length > 1
        ? { title: "Duties due each month", valueLabel: "Duties", points: t.points, averageLabel: "Average month in this period" }
        : undefined,
      panels: [
        // ── TWO PANELS THAT CANNOT COLLAPSE TO ONE BAR ─────────────────
        //
        // Every panel below is a "top N" over the doers, the frequencies or
        // the departments, so with one duty on record each has one category
        // and becomes a card. These two are different in kind: their
        // categories come from the QUESTION, not from the data, so both bars
        // exist whether the answer is 1 and 0 or 400 and 37. Zero is an
        // answer, and on a checklist it is the answer that matters.
        {
          title: "Done against still to do",
          fixedCategories: true,
          valueLabel: "Duties",
          rows: [
            { label: "Done", value: doneOfComeRound.length, display: count(doneOfComeRound.length), tone: "good" },
            { label: "Past their day", value: delayed.length, display: count(delayed.length), tone: "bad" },
            // Neutral, not amber: a duty whose day has not come round is not
            // late and colouring it as a warning would put the whole checklist
            // permanently in the red on the first of every month.
            { label: "Still ahead", value: raw.length - comeRound.length, display: count(raw.length - comeRound.length), tone: "neutral" },
          ],
          note: "Of every duty in the period. Still ahead has not come round yet, so it is not late.",
        },
        {
          title: "On time against late",
          fixedCategories: true,
          valueLabel: "Duties",
          rows: [
            { label: "On time", value: onTime.length, display: count(onTime.length), tone: "good" },
            { label: "Done late", value: done.length - onTime.length, display: count(done.length - onTime.length), tone: "warn" },
          ],
          note: "Only duties that were actually completed. A duty not yet done is neither on time nor late.",
        },
        { title: "Who carries the most duties", valueLabel: "Duties", rows: rank([...byDoer].map(([label, value]) => ({ label, value, meta: `${doneByDoer.get(label) ?? 0} done` })), count) },
        {
          title: "How often each duty comes round",
          valueLabel: "Duties",
          kind: "share",
          rows: rank([...byFreq].map(([label, value]) => ({ label, value })), count, 6),
        },
        { title: "Which departments they sit in", valueLabel: "Duties", rows: rank([...byDept].map(([label, value]) => ({ label, value })), count) },
      ],
      insights,
      caveats: [
        "The two percentages have DIFFERENT denominators, on purpose. On time is of what was DONE; completion is of what has COME ROUND. Dividing both by everything ever scheduled makes completion climb through a month for no reason other than the calendar.",
        "Today, Delayed and Upcoming are worked out from the planned date when the report runs — they are never stored. A stored status needs a nightly sweep to stay truthful, and a night it did not run is a morning the whole checklist lies.",
        "A duty landing on a holiday is DROPPED for that cycle, not moved to the next day, so it never appears here as missed.",
        "A figure that cannot be computed shows a dash, never 0%. On-time is a dash when nothing has been completed yet.",
      ],
    },
  };
}

export const dutyRegister: ReportDefinition = {
  id: "checklist.duty-register",
  module: "checklist",
  title: "Duty register",
  description:
    "One row per duty on one day — who it belongs to, when it was due, when it was actually done, and whether that was on time.",
  defaultMonthsBack: 3,
  columns: [
    { key: "task_name", label: "Duty", type: "text", width: 36 },
    { key: "doer", label: "Who", type: "text", width: 24 },
    { key: "department", label: "Department", type: "text", width: 20 },
    { key: "doer_email", label: "Email", type: "text", width: 28, optional: true },
    { key: "frequency", label: "How often", type: "text", width: 14 },
    { key: "planned_date", label: "Due on", type: "date" },
    { key: "actual_date", label: "Done on", type: "date" },
    { key: "status", label: "Status", type: "text", width: 12, note: "Only Scheduled and Done are stored. Everything else is worked out when the report runs." },
    { key: "state", label: "Where it stands", type: "text", width: 14, badge: { "Done": "good", "Due today": "warn", "Delayed": "bad", "Upcoming": "neutral" }, note: "Done, Due today, Delayed or Upcoming — derived from the due date at the moment this file was made." },
    { key: "on_time", label: "On time", type: "boolean",
      // Only the late ones. "Where it stands" beside this already carries the
      // green for Done, and two green columns side by side is a page that
      // looks reassuring rather than one that reads.
      badge: { No: "bad" },
      note: "Done on or before the day it was due. Blank until it is done." },
    { key: "days_late", label: "Days late", type: "int", total: "avg", note: "Only for duties that were done. The foot shows the average lateness, not a sum." },
    { key: "days_overdue", label: "Days overdue", type: "int", total: "avg", note: "For duties past their day and not ticked, counted to today." },
    { key: "task_active", label: "Duty still active", type: "boolean",
      // Grey, not amber: a switched-off duty is not a failure, but a reader
      // counting rows needs to know this one will never come round again.
      badge: { No: "neutral" },
      note: "A switched-off duty keeps its history; it just stops generating new days." },
    { key: "assigned_by", label: "Assigned by", type: "text", width: 22 },
    { key: "notes", label: "Notes", type: "text", width: 32, optional: true },
    { key: "updated_at", label: "Last touched", type: "datetime" },
  ],
  filters: [
    { key: "dateRange", label: "Due date", kind: "dateRange" },
    {
      key: "doer",
      label: "Who",
      kind: "select",
      options: async () => {
        const rows = await pg.unsafe(
          `select distinct name as v from ld_checklist_system.doers
            where deleted_at is null and name is not null order by 1`,
        );
        return (rows as unknown as { v: string }[]).map((r) => ({ value: r.v, label: r.v }));
      },
    },
    {
      key: "frequency",
      label: "How often",
      kind: "select",
      options: async () =>
        Object.entries(FREQ).map(([value, label]) => ({ value, label })),
    },
    {
      key: "status",
      label: "Status",
      kind: "select",
      options: async () => [
        { value: "Scheduled", label: "Scheduled" },
        { value: "Done", label: "Done" },
      ],
    },
  ],
  run,
};
