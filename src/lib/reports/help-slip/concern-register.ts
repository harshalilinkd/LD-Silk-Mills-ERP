import "server-only";

import { sql } from "drizzle-orm";

import { NotProvisionedError, withCurrentUser } from "@/lib/help-slip/authz";
import { todayIso } from "@/lib/dates";
import { fillMonths, rank, spread, trend } from "../analysis";
import { count, pct, plural } from "../format";
import { n } from "../num";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";

/**
 * Help Slip concern register — one row per concern the READER is allowed to
 * see.
 *
 * ── THIS IS THE ONE REPORT IN THE ERP THAT COULD LEAK ────────────────────
 *
 * Help Slip keeps its entire authorization model in Row Level Security: which
 * employee may see which concern, and which coordinator may see a confidential
 * (`hr_only`) one. Our pool connects as `postgres`, which has `rolbypassrls` —
 * a bare query here returns EVERYTHING, confidential complaints included, with
 * no error and no warning, and hands it to whoever pressed Export.
 *
 * So this report does not touch `pg.unsafe` like every other one does. It runs
 * inside `withCurrentUser`, which opens a transaction, drops to the
 * `authenticated` role and injects the caller's own profile id as the claim
 * `auth.uid()` reads. The database then enforces exactly what it enforces for
 * the standalone app, and two people running this report get two different
 * files — which is the correct outcome, and is why the Notes sheet says whose
 * view the file is.
 *
 * **Never replace this with a plain query, not even "temporarily to check a
 * number".** There is no second layer behind it.
 *
 * ── ONE REPORT, AND THE FREE TEXT IS NOT IN IT ───────────────────────────
 *
 * The concern's description, the proposed solutions and the comment thread are
 * deliberately NOT columns. They are what somebody wrote about a colleague or
 * a manager, often in confidence; a spreadsheet is a file that gets forwarded.
 * The title is here because it is what the coordinator's own list shows, and
 * everything else is a count, a date or a status. The detail stays on the
 * screen, where the same RLS applies to every read.
 */
const SQL = sql`
  select
    c.concern_number,
    c.title,
    c.category,
    c.priority::text    as priority,
    c.status::text      as status,
    c.visibility::text  as visibility,
    c.wait_reason::text as wait_reason,
    d.name              as department,
    emp.full_name       as raised_by,
    emp.employee_code   as raised_by_code,
    asg.full_name       as assigned_to,
    res.full_name       as resolved_by,
    c.filed_for_name,
    c.source,
    c.created_at,
    c.first_response_at,
    c.resolved_at,
    c.closed_at,
    c.withdrawn_at,
    c.updated_at,
    (c.accepted_solution_id is not null) as used_their_solution,
    (select count(*) from ld_help_slip.concern_solutions s where s.concern_id = c.id) as solutions_offered,
    (select count(*) from ld_help_slip.concern_updates u
      where u.concern_id = c.id and u.update_type = 'comment' and not u.is_internal) as replies,
    (select count(*) from ld_help_slip.concern_attachments a where a.concern_id = c.id) as photos
  from ld_help_slip.concerns c
  left join ld_help_slip.departments d on d.id = c.department_id
  left join ld_help_slip.profiles emp  on emp.id = c.employee_id
  left join ld_help_slip.profiles asg  on asg.id = c.assigned_to
  left join ld_help_slip.profiles res  on res.id = c.resolved_by
  -- Newest first, then the concern number — the number is unique and assigned
  -- by a trigger, so two runs of the same period produce the same file.
  order by c.created_at desc, c.concern_number desc
`;

type Raw = {
  concern_number: string; title: string; category: string | null; priority: string;
  status: string; visibility: string; wait_reason: string | null; department: string | null;
  raised_by: string | null; raised_by_code: string | null; assigned_to: string | null;
  resolved_by: string | null; filed_for_name: string | null; source: string | null;
  created_at: string; first_response_at: string | null; resolved_at: string | null;
  closed_at: string | null; withdrawn_at: string | null; updated_at: string;
  used_their_solution: boolean; solutions_offered: number; replies: number; photos: number;
};

const STATUS: Record<string, string> = {
  new: "New",
  in_progress: "Being worked on",
  waiting: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
  // No `withdrawn` here: the database enum has no such status. Withdrawal is
  // recorded as a timestamp, which the "Withdrawn" column reads — offering it
  // as a status was a dropdown entry that could never match a row.
};

const hours = (from: string, to: string) =>
  Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000) * 10) / 10;

async function run(params: ReportParams): Promise<ReportResult> {
  let raw: Raw[];
  try {
    raw = await withCurrentUser(async (db) => {
      const res = await db.execute(SQL);
      return res as unknown as Raw[];
    });
  } catch (e) {
    // Somebody with the module ticked in Access but no Help Slip profile. An
    // empty file that says why beats a 500 they cannot act on.
    if (e instanceof NotProvisionedError) {
      return {
        rows: [],
        totalRows: 0,
        notice:
          "This report shows the concerns your own account is allowed to see, and your account has no Help Slip profile against it. Ask an administrator to add you in Settings, then run it again.",
        analysis: {
          headline: "You do not have a Help Slip profile.",
          kpis: [],
          panels: [],
          insights: [
            "This report shows the concerns YOUR account is allowed to see, and your account has no Help Slip profile against it. Ask an administrator to add you in Settings, then run it again.",
          ],
          caveats: [],
        },
      };
    }
    throw e;
  }

  // The date filter is applied HERE rather than in SQL, so the one query stays
  // inside the RLS transaction with nothing appended to it.
  const from = params.from ?? null;
  const to = params.to ?? null;
  const filtered = raw.filter((r) => {
    const d = r.created_at?.slice(0, 10) ?? "";
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (params.status && r.status !== params.status) return false;
    if (params.priority && r.priority !== params.priority) return false;
    return true;
  });

  const today = todayIso();
  const rows: ReportRow[] = filtered.slice(0, MAX_EXPORT_ROWS).map((r) => {
    // A withdrawn concern is not open, and its STATUS never says so — the
    // enum has no withdrawn member, only the timestamp does.
    const open = !["resolved", "closed"].includes(r.status) && !r.withdrawn_at;
    return {
      concern_number: r.concern_number,
      title: r.title,
      category: r.category,
      department: r.department,
      priority: r.priority,
      status: STATUS[r.status] ?? r.status,
      confidential: r.visibility === "hr_only",
      wait_reason: r.wait_reason,
      raised_by: r.raised_by,
      raised_by_code: r.raised_by_code,
      filed_for_name: r.filed_for_name,
      assigned_to: r.assigned_to,
      resolved_by: r.resolved_by,
      solutions_offered: n(r.solutions_offered),
      used_their_solution: r.used_their_solution,
      replies: n(r.replies),
      photos: n(r.photos),
      raised_at: r.created_at,
      first_response_at: r.first_response_at,
      hours_to_first_reply: r.first_response_at ? hours(r.created_at, r.first_response_at) : null,
      resolved_at: r.resolved_at,
      days_to_resolve:
        r.resolved_at
          ? Math.round(((Date.parse(r.resolved_at) - Date.parse(r.created_at)) / 86_400_000) * 10) / 10
          : null,
      days_open: open
        ? Math.round((Date.parse(today) - Date.parse(r.created_at.slice(0, 10))) / 86_400_000)
        : null,
      still_open: open,
      closed_at: r.closed_at,
      withdrawn: !!r.withdrawn_at,
      source: r.source,
      updated_at: r.updated_at,
    };
  });

  // ── the figures ─────────────────────────────────────────────────────────
  const open = filtered.filter(
    (r) => !["resolved", "closed"].includes(r.status) && !r.withdrawn_at,
  );
  const resolved = filtered.filter((r) => r.resolved_at);
  const answered = filtered.filter((r) => r.first_response_at);
  const unanswered = filtered.filter((r) => !r.first_response_at);
  const confidential = filtered.filter((r) => r.visibility === "hr_only").length;
  const withSolutions = filtered.filter((r) => n(r.solutions_offered) > 0);
  const usedTheirs = filtered.filter((r) => r.used_their_solution).length;

  const replyHours = spread(answered.map((r) => hours(r.created_at, r.first_response_at!)));
  const resolveDays = spread(
    resolved.map((r) => (Date.parse(r.resolved_at!) - Date.parse(r.created_at)) / 86_400_000),
  );

  // Filled across the period, so quiet months read as quiet rather than
  // disappearing off the axis — which is what left this dashboard with a
  // single unplottable point and therefore no chart at all.
  const byMonth = new Map<string, number>();
  for (const r of filtered) {
    const m = r.created_at?.slice(0, 7);
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const t = trend(fillMonths(byMonth, params), count);

  const byDept = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();
  for (const r of filtered) {
    byDept.set(r.department?.trim() || "Not recorded", (byDept.get(r.department?.trim() || "Not recorded") ?? 0) + 1);
    byStatus.set(STATUS[r.status] ?? r.status, (byStatus.get(STATUS[r.status] ?? r.status) ?? 0) + 1);
    byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + 1);
  }

  const insights: string[] = [];
  if (filtered.length) {
    insights.push(
      `${count(open.length)} of ${count(filtered.length)} concerns are still open — ${pct((open.length / filtered.length) * 100, 0)} of what you can see.`,
    );
  }
  if (unanswered.length) {
    insights.push(
      `${count(unanswered.length)} have had no reply at all yet. The first reply is the one that decides whether somebody raises the next one.`,
    );
  }
  if (replyHours.n > 0 && replyHours.median !== null) {
    insights.push(
      `Where somebody did reply, the middle concern waited ${replyHours.median.toFixed(1)} hours and the slowest tenth over ${replyHours.p90?.toFixed(1)} hours.`,
    );
  }
  if (resolveDays.n > 0 && resolveDays.median !== null) {
    insights.push(
      `${count(resolveDays.n)} have been resolved; the middle one took ${resolveDays.median.toFixed(1)} days.`,
    );
  }
  if (withSolutions.length) {
    insights.push(
      `${count(withSolutions.length)} of ${count(filtered.length)} concerns came with the employee's own proposed fix, and ${count(usedTheirs)} of those fixes were the one adopted. That is the point of the slip: the person closest to the problem usually knows the answer.`,
    );
  }
  if (filtered.length < 20) {
    insights.push(
      `Only ${plural(filtered.length, "concern")} ${filtered.length === 1 ? "is" : "are"} visible to you in this period. The figures above are true and thin.`,
    );
  }

  return {
    rows,
    totalRows: filtered.length,
    analysis: {
      headline: filtered.length
        ? `${count(open.length)} of ${count(filtered.length)} concerns are still open.`
        : "No concerns you can see in this period.",
      kpis: [
        { label: "Concerns", value: count(filtered.length) },
        { label: "Still open", value: count(open.length), tone: open.length ? "warn" : "good", lowerIsBetter: true },
        { label: "Resolved", value: count(resolved.length), tone: "good" },
        { label: "No reply yet", value: count(unanswered.length), tone: unanswered.length ? "bad" : "good", lowerIsBetter: true },
        { label: "Middle first reply", value: replyHours.median !== null ? `${replyHours.median.toFixed(1)} h` : "—", sub: answered.length ? `over ${count(answered.length)} concerns` : "nobody has replied yet" },
        { label: "Middle time to resolve", value: resolveDays.median !== null ? `${resolveDays.median.toFixed(1)} d` : "—" },
        { label: "Came with a fix", value: count(withSolutions.length), tone: "good", sub: `${count(usedTheirs)} were adopted` },
        { label: "Confidential", value: count(confidential), sub: "you are allowed to see these" },
      ],
      trend: t.points.length > 1
        ? { title: "Concerns raised each month", valueLabel: "Concerns", points: t.points, averageLabel: "Average month in this period" }
        : undefined,
      panels: [
        // ── A PANEL THAT CANNOT COLLAPSE TO ONE BAR ────────────────────
        //
        // The three panels below rank whatever happens to be in the data, so
        // one concern gives each of them one category and they become cards.
        // This one asks a question with two fixed sides, both of which exist
        // whether the answer is 1 and 0 or 40 and 12 — and it is the only
        // question a coordinator opens this file to answer.
        {
          title: "Settled against still open",
          fixedCategories: true,
          valueLabel: "Concerns",
          rows: [
            { label: "Resolved or closed", value: filtered.length - open.length, display: count(filtered.length - open.length) },
            { label: "Still open", value: open.length, display: count(open.length) },
          ],
          note: "Of the concerns you are allowed to see. A withdrawn concern counts as settled.",
        },
        {
          title: "Answered against waiting for a first reply",
          fixedCategories: true,
          valueLabel: "Concerns",
          rows: [
            { label: "Someone has replied", value: answered.length, display: count(answered.length) },
            { label: "No reply yet", value: unanswered.length, display: count(unanswered.length) },
          ],
          note: "A first reply is the first response recorded against the concern, not the first time somebody opened it.",
        },
        {
          title: "Where the concerns stand",
          valueLabel: "Concerns",
          kind: "share",
          rows: rank([...byStatus].map(([label, value]) => ({ label, value })), count, 6),
        },
        { title: "Which departments they come from", valueLabel: "Concerns", rows: rank([...byDept].map(([label, value]) => ({ label, value })), count) },
        { title: "How urgent they were marked", valueLabel: "Concerns", rows: rank([...byPriority].map(([label, value]) => ({ label, value })), count, 6) },
      ],
      insights,
      caveats: [
        "THIS FILE IS YOUR VIEW, not everybody's. Help Slip decides in the database which concerns each person may see, and this report runs as YOU — so a coordinator without HR access and one with it will export different numbers of rows from the same period, and both are correct. The Notes sheet records whose export it is.",
        "The description, the proposed solutions and the comment thread are deliberately NOT in this file. They are what somebody wrote about a colleague, often in confidence, and a spreadsheet is a file that gets forwarded. Counts and dates are here; the words stay on the screen.",
        "“Hours to first reply” is measured from when the concern was raised to the first response recorded against it — not to the first time anybody opened it.",
        "A withdrawn concern is kept and flagged, never deleted.",
      ],
    },
  };
}

export const concernRegister: ReportDefinition = {
  id: "help-slip.concern-register",
  module: "help-slip",
  title: "Concern register",
  description:
    "One row per concern you are allowed to see — who raised it, which department, how urgent, how quickly it was answered and whether their own proposed fix was the one used.",
  defaultMonthsBack: 6,
  columns: [
    { key: "concern_number", label: "Number", type: "text", width: 14 },
    { key: "title", label: "Concern", type: "text", width: 40 },
    { key: "category", label: "Category", type: "text", width: 20 },
    { key: "department", label: "Department", type: "text", width: 18 },
    { key: "priority", label: "Priority", type: "text", width: 12 },
    { key: "status", label: "Status", type: "text", width: 18, badge: { "Resolved": "good", "Closed": "good", "Being worked on": "neutral", "Waiting": "warn", "New": "warn" } },
    { key: "confidential", label: "Confidential", type: "boolean", note: "An HR-only concern. It is in your file because you are allowed to see it." },
    { key: "wait_reason", label: "Waiting on", type: "text", width: 20 },
    { key: "raised_by", label: "Raised by", type: "text", width: 24 },
    { key: "raised_by_code", label: "Employee code", type: "text", width: 14 },
    { key: "filed_for_name", label: "Filed for", type: "text", width: 24, note: "Where somebody raised it on another person's behalf." },
    { key: "assigned_to", label: "Assigned to", type: "text", width: 24 },
    { key: "resolved_by", label: "Resolved by", type: "text", width: 24 },
    { key: "solutions_offered", label: "Fixes they proposed", type: "int", note: "Up to three, written by the person raising it. This is the point of the slip." },
    { key: "used_their_solution", label: "Their fix was used", type: "boolean" },
    { key: "replies", label: "Replies", type: "int", note: "Comments the employee can see. Internal coordinator notes are not counted." },
    { key: "photos", label: "Photos", type: "int" },
    { key: "raised_at", label: "Raised at", type: "datetime" },
    { key: "first_response_at", label: "First reply at", type: "datetime" },
    { key: "hours_to_first_reply", label: "Hours to first reply", type: "number", total: "avg", note: "The foot shows the average, not a sum." },
    { key: "resolved_at", label: "Resolved at", type: "datetime" },
    { key: "days_to_resolve", label: "Days to resolve", type: "number", total: "avg" },
    { key: "days_open", label: "Days open", type: "int", total: "avg", note: "For the ones not yet resolved, counted to today." },
    { key: "still_open", label: "Still open", type: "boolean", note: "Filter this to Yes for what needs attention." },
    { key: "closed_at", label: "Closed at", type: "datetime" },
    { key: "withdrawn", label: "Withdrawn", type: "boolean" },
    { key: "source", label: "Raised through", type: "text", width: 14, optional: true },
    { key: "updated_at", label: "Last touched", type: "datetime" },
  ],
  filters: [
    { key: "dateRange", label: "Raised", kind: "dateRange" },
    {
      key: "status",
      label: "Status",
      kind: "select",
      options: async () => Object.entries(STATUS).map(([value, label]) => ({ value, label })),
    },
    {
      key: "priority",
      label: "Priority",
      kind: "select",
      options: async () => [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ],
    },
  ],
  run,
};
