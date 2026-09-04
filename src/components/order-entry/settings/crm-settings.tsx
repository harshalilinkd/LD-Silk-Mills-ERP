"use client";

import Link from "next/link";

// Settings → CRM — docs/SCREENS.md §6.4.
//
// Two bands. Band 1 is the four tuning knobs plus the auto-create switch, with
// a plain-English side card that restates the rules using the numbers as they
// are being typed. Band 2 is the four managed vocabularies the call panel is
// built from: rating criteria (their own table) and three lookup_values
// categories behind one shared ManagedList.
//
// Until this screen existed every knob below was SQL-only, which meant nobody
// but a developer could pause follow-up creation or change when one escalates.
//
// ⚠️ GET /api/order-entry/lookups returns `string[]`, NOT row objects, unless
// `?all=1` is passed (SCREENS.md §8.8). Everything here needs ids and active
// flags, so every read passes `all=1` — and still filters defensively, because
// typing that response wrong yields `[undefined]` and a crash on mount.
import { useCallback, useEffect, useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import {
  ErrorBanner,
  INPUT_CLS,
  LoadingRow,
  NoticeBanner,
  Panel,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Band 1 — the knobs
// ---------------------------------------------------------------------------

type CrmSettings = {
  transit_days_default: number;
  followup_due_days: number;
  max_attempts: number;
  escalate_rating_at: number;
  auto_create_followups: boolean;
  transport_transit_days: Record<string, number> | null;
  updated_at: string;
};

type NumKey =
  | "transit_days_default"
  | "followup_due_days"
  | "max_attempts"
  | "escalate_rating_at";

const FIELDS: {
  key: NumKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "transit_days_default",
    label: "Transit days",
    hint: "Days after dispatch before we assume the goods landed, when no LR is ticked.",
    min: 0,
    max: 60,
  },
  {
    key: "followup_due_days",
    label: "Call within",
    hint: "Days after delivery that a follow-up is due. A call three weeks later gets nothing useful.",
    min: 0,
    max: 60,
  },
  {
    key: "max_attempts",
    label: "Attempts before unreachable",
    hint: "Failed attempts before the follow-up moves to UNREACHABLE. Reopenable.",
    min: 1,
    max: 10,
  },
  {
    key: "escalate_rating_at",
    label: "Escalate at rating",
    hint: "An overall rating at or below this flags the follow-up for principal review.",
    min: 1,
    max: 5,
  },
];

/** The `flex items-start gap-3 …` shell every knob row (and the switch) uses. */
const KNOB_CLS =
  "flex items-start gap-3 rounded-field border border-border bg-surface-2 px-3 py-2.5";

function CrmKnobs() {
  const [saved, setSaved] = useState<CrmSettings | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<CrmSettings>("/api/crm/settings");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setSaved(res.data);
    setEdited(
      Object.fromEntries(FIELDS.map((f) => [f.key, String(res.data[f.key])])),
    );
    setAuto(res.data.auto_create_followups);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Only send what actually moved — the schema rejects an empty patch, and a
  // full overwrite would clobber a value another admin changed meanwhile.
  const patch: Record<string, number | boolean> = {};
  if (saved) {
    for (const f of FIELDS) {
      const raw = edited[f.key];
      if (raw === undefined || raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isNaN(n) && n !== saved[f.key]) patch[f.key] = n;
    }
    if (auto !== null && auto !== saved.auto_create_followups) {
      patch.auto_create_followups = auto;
    }
  }
  const dirty = Object.keys(patch).length;

  async function save() {
    if (dirty === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson<CrmSettings>("/api/crm/settings", {
      method: "PATCH",
      body: patch,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // PATCH echoes the whole row back (not just what was sent), so the boxes
    // are re-seeded from it — a field another admin moved meanwhile lands here
    // rather than staying stale and reading as "dirty" forever.
    if (res.data) {
      const after = res.data;
      setSaved(after);
      setEdited(
        Object.fromEntries(FIELDS.map((f) => [f.key, String(after[f.key])])),
      );
      setAuto(after.auto_create_followups);
    } else {
      await load();
    }
    setNotice("CRM settings saved.");
  }

  // The side card reads the EDITED boxes, not the saved row, so the rules move
  // as you type. An empty or nonsense box reads as an em dash rather than NaN.
  const shown = (key: NumKey) => {
    const raw = edited[key];
    return raw !== undefined && raw.trim() !== "" && !Number.isNaN(Number(raw))
      ? raw
      : "—";
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
      <Panel
        title="CRM follow-ups"
        description="When a follow-up is created, when it is due, and when it escalates."
        action={
          <span className="text-[11px] text-text-3">days, unless stated</span>
        }
        bodyClassName="flex flex-col gap-3"
      >
        <ErrorBanner message={error} />
        <NoticeBanner message={notice} />

        {loading ? (
          <LoadingRow />
        ) : (
          <>
            {FIELDS.map((f) => (
              <div key={f.key} className={KNOB_CLS}>
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-1">
                    {f.label}
                  </div>
                  <p className="mt-0.5 text-xs text-text-2">{f.hint}</p>
                </div>
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={1}
                  aria-label={f.label}
                  className={cn(
                    INPUT_CLS,
                    "num mt-0.5 h-9 w-20 shrink-0 text-center",
                  )}
                  value={edited[f.key] ?? ""}
                  onChange={(e) =>
                    setEdited((m) => ({ ...m, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}

            <div className={KNOB_CLS}>
              <div className="flex-1">
                <div className="text-sm font-medium text-text-1">
                  Create follow-ups automatically
                </div>
                <p className="mt-0.5 text-xs text-text-2">
                  Off pauses new follow-ups. Nothing already created is deleted,
                  and the queue keeps working.
                </p>
              </div>
              <Segmented
                label="Create follow-ups automatically"
                size="sm"
                className="mt-0.5"
                value={auto === false ? "off" : "on"}
                onChange={(v) => setAuto(v === "on")}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="lg"
                disabled={busy || dirty === 0}
                onClick={() => void save()}
              >
                {busy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  `Save${dirty ? ` (${dirty})` : ""}`
                )}
              </Button>
            </div>
          </>
        )}
      </Panel>

      <Panel title="What these change" bodyClassName="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-text-2">
          A follow-up is created when every active line on an order has landed —
          the LR is back, <i>or</i> dispatch happened and{" "}
          <b className="num font-semibold text-text-1">
            {shown("transit_days_default")}
          </b>{" "}
          transit days have passed.
        </p>
        <p className="text-[13px] leading-relaxed text-text-2">
          It is then due{" "}
          <b className="num font-semibold text-text-1">
            {shown("followup_due_days")}
          </b>{" "}
          days later, and goes overdue after that.
        </p>
        <p className="text-[13px] leading-relaxed text-text-2">
          After{" "}
          <b className="num font-semibold text-text-1">
            {shown("max_attempts")}
          </b>{" "}
          failed attempts it becomes{" "}
          <b className="font-semibold text-text-1">Unreachable</b>; an overall
          rating of{" "}
          <b className="num font-semibold text-text-1">
            {shown("escalate_rating_at")}
          </b>{" "}
          or below flags it for review.
        </p>
        <p className="text-[11.5px] leading-relaxed text-text-3">
          Changing transit days re-dates <i>future</i> follow-ups only. Anything
          already in the queue keeps the delivery date it was created with, so
          the coordinator&rsquo;s list does not reshuffle under them.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band 2 — the managed vocabularies
//
// Both lists below were fixed vocabularies in code until the CRM tables
// landed; neither survived contact with real calls, so they are managed here.
// ---------------------------------------------------------------------------

type Criterion = {
  id: string;
  key: string;
  label: string;
  hint: string | null;
  sort_order: number;
  is_active: boolean;
};

function RatingCriteria() {
  const [rows, setRows] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<Criterion[]>("/api/crm/rating-criteria?all=1");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setRows(Array.isArray(res.data) ? res.data : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const name = label.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const res = await apiJson("/api/crm/rating-criteria", {
      method: "POST",
      body: { label: name, hint: hint.trim() || null },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    await load();
    setBusy(false);
    setLabel("");
    setHint("");
  }

  // Retire / restore, never delete: scores already given reference this row's
  // key, and removing it would leave every call that used it unlabelled.
  async function setActive(c: Criterion, active: boolean) {
    setBusy(true);
    setError(null);
    const res = await apiJson(`/api/crm/rating-criteria/${c.id}`, {
      method: "PATCH",
      body: { is_active: active },
    });
    if (!res.ok) {
      setBusy(false);
      // The API refuses to retire the last active criterion (the call panel
      // would have nothing to score); its wording is what the admin sees.
      setError(res.error);
      return;
    }
    await load();
    setBusy(false);
  }

  // Move one row by a place. Rather than nudge a single sort_order — which
  // ties with the neighbour and leaves the label tiebreak deciding the order —
  // the list is renumbered 1..N around the swap and only the rows that
  // actually moved are written. Sequential writes, never a fan-out (§0.6.6).
  async function move(index: number, delta: number) {
    const j = index + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];

    setBusy(true);
    setError(null);
    for (let k = 0; k < next.length; k += 1) {
      const want = k + 1;
      if (next[k].sort_order === want) continue;
      const res = await apiJson(`/api/crm/rating-criteria/${next[k].id}`, {
        method: "PATCH",
        body: { sort_order: want },
      });
      if (!res.ok) {
        setBusy(false);
        setError(res.error);
        await load();
        return;
      }
    }
    await load();
    setBusy(false);
  }

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <Panel
      title="Rating criteria"
      action={
        <span className="text-[11.5px] text-text-3">{activeCount} in use</span>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <p className="text-xs leading-relaxed text-text-2">
        What every delivered order is scored on, 1–5, on the call panel. The
        overall score is suggested as the mean of these and the coordinator may
        override it.
      </p>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingRow />
      ) : (
        <>
          {rows.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-3 rounded-field border border-border bg-surface-2 px-3 py-2",
                !c.is_active && "opacity-55",
              )}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`Move ${c.label} up`}
                  disabled={i === 0 || busy}
                  onClick={() => void move(i, -1)}
                  className="cursor-pointer text-text-2 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <IconChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${c.label} down`}
                  disabled={i === rows.length - 1 || busy}
                  onClick={() => void move(i, 1)}
                  className="cursor-pointer text-text-2 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <IconChevronDown className="size-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-1">{c.label}</div>
                {c.hint && <div className="text-xs text-text-2">{c.hint}</div>}
              </div>
              {!c.is_active && (
                <span className="rounded-pill bg-chip px-2 py-0.5 text-[11.5px] font-semibold text-text-3">
                  retired
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void setActive(c, !c.is_active)}
              >
                {c.is_active ? "Retire" : "Restore"}
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              className={cn(INPUT_CLS, "min-w-[200px] flex-1")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="New criterion, e.g. Billing accuracy"
            />
            <input
              className={cn(INPUT_CLS, "min-w-[160px] flex-1")}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Short gloss (optional)"
            />
            <Button
              size="lg"
              disabled={busy || !label.trim()}
              onClick={() => void add()}
            >
              {busy ? <Spinner /> : null} Add
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-text-3">
            Retiring keeps every score already given and simply stops offering
            the row on new calls — the same way a deactivated dropdown value
            still reads correctly on the orders that used it. Nothing here is
            ever hard-deleted.
          </p>
        </>
      )}
    </Panel>
  );
}

// `ManagedList` and its `LookupRow` type lived here and are deleted, not
// commented out. They rendered the three shared vocabularies that now live
// in Masters; leaving a second editor in the tree is how the two screens
// drift apart later. The Masters screen uses `DropdownMaster`, which does
// the same job for all nine lists.

// ---------------------------------------------------------------------------

export function CrmSettingsPanel() {
  return (
    <div className="flex flex-col gap-5">
      <CrmKnobs />

      {/* THREE LISTS USED TO SIT HERE — complaint categories, departments and
          delay reasons — and they are gone because they were editable in two
          places at once. They are `lookup_values` rows exactly like party and
          fabric, shared with the rest of the ERP, and they now live in Masters
          with the other six. Two screens editing one table is how the same
          list ends up different depending on where you opened it.

          Rating criteria STAYS: it is `crm_rating_criteria`, a table of its
          own that only the call panel scores against, and it is genuinely CRM
          configuration rather than a shared vocabulary. */}
      <RatingCriteria />

      <Panel title="Departments, complaint categories and delay reasons">
        <p className="text-[13px] leading-relaxed text-text-2">
          These three are shared with the rest of the ERP, so they are edited
          once in{" "}
          <Link
            href="/masters"
            className="font-semibold text-accent-text underline underline-offset-2"
          >
            Masters
          </Link>{" "}
          rather than here. Nothing about how CRM uses them has changed — the
          call panel and the issues board read the same lists they always did.
        </p>
      </Panel>

      {/* §6.4 — the closing note. Worth keeping on the screen itself: the
          absence of these three settings looks like an oversight otherwise,
          and the next admin to "fix" it would be turning escalation off. */}
      <Panel title="What is not configurable, and why">
        <p className="text-[13px] leading-relaxed text-text-2">
          Severity, attempt outcomes and reorder intent stay fixed in code.{" "}
          <b className="font-semibold text-text-1">HIGH</b> drives escalation in
          three places,{" "}
          <b className="font-semibold text-text-1">isReachedOutcome()</b> drives
          the follow-up state machine and the{" "}
          <b className="font-semibold text-text-1">contacted_at</b> stamp, and
          the analytics count specific reorder values. Making any of them data
          would let a rename here silently switch off escalation somewhere else.
        </p>
      </Panel>
    </div>
  );
}
