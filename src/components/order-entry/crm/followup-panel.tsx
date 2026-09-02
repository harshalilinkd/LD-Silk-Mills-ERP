"use client";

// The follow-up panel — docs/SCREENS.md §7.2
//
// The component the whole CRM module exists to serve. It is **a brief plus five
// stages**, not one form: the left column is what the coordinator READS before
// and during the call, the right column is what they FILL IN, and the five
// stages are one job with an order to it.
//
// What saves when (§7.2.9): attempts and issues are EVENTS and POST the moment
// they happen — a browser crash must not lose them. Everything else is a form
// over a slow conversation and is PATCHed in one go.
//
// Palette translated to this app's tokens (docs/DESIGN.md): ink → text-1,
// ink-soft → text-2, ink-muted → text-3, line → border, line-strong →
// border-strong, inset → chip, accent-soft → accent, accent-deep → accent-text,
// success/warning/danger → status-green/-amber/-red.

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconPackage,
  IconPhoneOff,
  IconPlus,
  IconRotateClockwise2,
  IconTruck,
} from "@tabler/icons-react";

import {
  CHANNEL_LABEL,
  CHANNEL_OUTCOMES,
  DEFAULT_ISSUE_CATEGORIES,
  DELAY_REASONS,
  DELAY_REASON_LABEL,
  ISSUE_SEVERITIES,
  OUTCOME_LABEL,
  OWNER_DEPTS,
  STATUS_LABEL,
  categoryLabel,
  deriveOverallRating,
  isReachedOutcome,
  overallRatingExact,
  type AttemptChannel,
  type AttemptOutcome,
  type DelayReason,
  type FollowupStatus,
  type IssueSeverity,
  type RatingSource,
  type ReorderIntent,
} from "@/lib/order-entry/crm";
import { formatDate, formatDateTime, formatNumber } from "@/lib/order-entry/orders";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Autocomplete } from "@/components/order-entry/orders/autocomplete";
import { apiGet, apiSend } from "./api-client";
import { DraggablePanel } from "./draggable-panel";
import { Pill } from "./pill";
import { StarPicker } from "./stars";

// ---------------------------------------------------------------------------
// The shape GET /api/crm/followups/:id returns (loadFollowupDetail, serialised
// to JSON — every timestamp arrives as an ISO string).
// ---------------------------------------------------------------------------

export type FollowupDetailJson = {
  followup: {
    id: string;
    status: string;
    customerSaysOnTime: boolean | null;
    delayReason: string | null;
    ratingOverall: number | null;
    ratingSource: string | null;
    reorderIntent: string;
    reorderNote: string | null;
    notes: string | null;
    completedBy: string | null;
    contactPerson: string | null;
    contactPhone: string | null;
    systemOnTime: boolean | null;
    deliveryBasis: string | null;
    deliveredAt: string | null;
    attemptCount: number;
    isEscalated: boolean;
  };
  /** Per-stage SLA outcome, so the panel can show numbers instead of a verdict. */
  sla: {
    stageKey: string;
    label: string;
    targetDays: number;
    lateMinutes: number;
    plannedAt: string | null;
    actualAt: string | null;
    done: number;
    total: number;
  }[];
  /** Scores by criterion key — the criteria are configurable rows (§7.2.7). */
  ratings: Record<string, number>;
  criteria: {
    key: string;
    label: string;
    hint: string | null;
    sortOrder: number;
    isActive: boolean;
  }[];
  order: {
    orderNo: string;
    orderDate: string;
    partyName: string;
    salesPerson: string | null;
    agent: string | null;
    transport: string | null;
  };
  lines: {
    id: string;
    quality: string;
    designNo: string;
    qtyMtr: string;
    isCancelled: boolean;
  }[];
  attempts: {
    id: string;
    channel: string;
    outcome: string;
    note: string | null;
    attemptedAt: string;
    /** Who made the contact — differs from createdBy, who merely keyed it in. */
    attendedBy: string | null;
    createdBy: string | null;
  }[];
  issues: {
    id: string;
    category: string;
    severity: string;
    ownerDept: string | null;
    quality: string | null;
    designNo: string | null;
    qtyAffected: string | null;
    description: string | null;
    status: string;
  }[];
};

/**
 * The queue row's own facts, which the detail endpoint does not carry.
 *
 * Optional: opened from the queue the panel gets the real row; deep-linked from
 * `/crm/:id` there is no row, and everything except the order value is derived
 * from the detail instead. A value we do not have is printed as `—`, never as 0.
 */
export type PanelRow = {
  orderNo: string;
  partyName: string;
  orderValue: number | null;
  daysWaiting: number;
  qualities: number;
  designs: number;
  qtyMtr: number;
  hadOutOfStock: boolean;
  hadCancellation: boolean;
};

function deriveRow(d: FollowupDetailJson): PanelRow {
  const live = d.lines.filter((l) => !l.isCancelled);
  const delivered = d.followup.deliveredAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(d.followup.deliveredAt).getTime()) / 86_400_000,
        ),
      )
    : 0;
  return {
    orderNo: d.order.orderNo,
    partyName: d.order.partyName,
    // Not in the detail payload — the order total is derived from the lines'
    // generated line_total and only the queue query computes it.
    orderValue: null,
    daysWaiting: delivered,
    qualities: new Set(live.map((l) => l.quality)).size,
    designs: live.length,
    qtyMtr: live.reduce((n, l) => n + Number(l.qtyMtr ?? 0), 0),
    hadOutOfStock: false,
    hadCancellation: d.lines.some((l) => l.isCancelled),
  };
}

// ---------------------------------------------------------------------------
// Left-column furniture
// ---------------------------------------------------------------------------

function Section({
  n,
  title,
  aside,
  muted,
  children,
}: {
  n: number;
  title: string;
  aside?: React.ReactNode;
  /** Rendered read-only — the step does not apply in the current state. */
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-b border-border px-5 py-4 last:border-b-0",
        // A blocked section stays READABLE — greying it to nothing would hide
        // what was already recorded. It simply stops accepting input.
        muted && "pointer-events-none opacity-45 select-none",
      )}
    >
      <h3 className="mb-3 flex items-center gap-2.5 text-[11.5px] font-semibold tracking-[0.1em] text-text-1 uppercase">
        <span className="grid size-[18px] shrink-0 place-items-center rounded-md bg-accent text-[11px] font-bold tracking-normal text-accent-text">
          {n}
        </span>
        <span className="text-text-1">{title}</span>
        {aside ? (
          <span className="ml-auto text-[11.5px] font-medium tracking-normal text-text-2 normal-case">
            {aside}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function Fact({
  k,
  v,
  wide,
}: {
  k: string;
  v: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <div className="text-[11px] font-semibold tracking-[0.07em] text-text-2 uppercase">
        {k}
      </div>
      {/* Deliberately plain ink: these are context, and colouring them would
          compete with the status information below. */}
      <div className="mt-0.5 text-[13.5px] leading-snug font-semibold text-text-1">
        {v}
      </div>
    </div>
  );
}

function Know({
  tone,
  icon,
  children,
}: {
  tone: "bad" | "ok" | "plain";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-field border-l-[3px] px-3 py-2.5 text-[12.5px] leading-relaxed",
        tone === "bad" &&
          "border-l-status-red bg-status-red-dim text-status-red",
        tone === "ok" &&
          "border-l-status-green bg-status-green-dim text-status-green",
        tone === "plain" && "border-l-border-strong bg-surface-2 text-text-2",
      )}
    >
      <span className="mt-[1px] shrink-0 [&_svg]:size-3.5">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One stage
// ---------------------------------------------------------------------------

/**
 * One step of the call, collapsed to a summary row until it is opened.
 *
 * The rail is why these are STAGES and not a list: five rows with numbers on
 * them are a list, five rows joined by a line are a process. Content sits
 * *under* the rail, indented to the badge, so an open stage is visibly part of
 * the step rather than a panel that replaced it.
 */
function Stage({
  n,
  title,
  summary,
  done,
  open,
  disabled,
  last,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  /** What this step currently holds, shown when it is closed. */
  summary: React.ReactNode;
  done?: boolean;
  open: boolean;
  disabled?: boolean;
  /** The last stage draws no connecting rail below it. */
  last?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="relative">
      {!last ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-[38px] bottom-0 left-[30px] w-px",
            done ? "bg-status-green/35" : "bg-border",
          )}
        />
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          "relative flex w-full cursor-pointer items-center gap-3 py-3 pr-4 pl-4 text-left transition-colors",
          open ? "bg-accent/50" : "hover:bg-surface-2",
          disabled && "cursor-not-allowed opacity-45",
        )}
      >
        <span
          className={cn(
            "z-10 grid size-[26px] shrink-0 place-items-center rounded-full text-[11.5px] font-bold ring-4 ring-surface transition-colors",
            done
              ? "bg-status-green text-surface"
              : open
                ? "bg-primary text-primary-foreground"
                : "bg-chip text-text-2",
          )}
        >
          {done ? <IconCheck className="size-3.5" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] leading-tight font-semibold text-text-1">
            {title}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-[12px]",
              done ? "text-text-2" : "text-text-2/85",
            )}
          >
            {summary}
          </span>
        </span>
        <IconChevronDown
          className={cn(
            "size-4 shrink-0 text-text-2 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="relative pt-1 pr-4 pb-5 pl-[54px]">{children}</div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  hint,
  wide,
  span2,
  children,
}: {
  label: string;
  hint?: string;
  /** Full width of the row. */
  wide?: boolean;
  /** Two columns — for the selects holding the longest values. */
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0",
        wide && "sm:col-span-2 xl:col-span-3",
        span2 && !wide && "xl:col-span-2",
      )}
    >
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[11.5px] font-semibold tracking-[0.05em] text-text-1 uppercase">
          {label}
        </span>
        {hint ? <span className="text-[11px] text-text-2">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

const selectCls =
  "h-8 rounded-field border border-border bg-surface px-2 text-[12.5px] text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * A managed vocabulary (§7.0). Fetched from `/api/order-entry/lookups`, which
 * returns a plain `string[]` unless you pass `?all=1` — typing it as `{value}[]`
 * yields `[undefined]` and takes the panel down on mount (§8.8), which is why
 * every call site filters for truthy strings.
 *
 * Two of these lists are managed data the WRITE schemas still enforce as code
 * enums (`owner_dept`, `delay_reason`). For those, `restrictTo` keeps the
 * select honest — offering a value the API would answer with a 422 is a trap —
 * and `fallback` covers the empty master list an admin has not populated in
 * Settings → CRM yet. Complaint categories take neither: the issues API accepts
 * free text and adds a new one to the master list itself.
 */
function useLookupList(
  category: string,
  fallback: readonly string[] = [],
  restrictTo?: readonly string[],
) {
  const q = useQuery({
    queryKey: ["lookups", category],
    queryFn: () =>
      apiGet<string[]>(
        `/api/order-entry/lookups?category=${encodeURIComponent(category)}`,
      ),
    staleTime: 5 * 60_000,
  });
  return React.useMemo(() => {
    // Without `?all=1` this endpoint returns a plain string[]; typing it as
    // {value}[] yields [undefined] and crashes on mount (§8.8).
    let values = (q.data ?? []).filter((v): v is string => !!v);
    if (restrictTo) values = values.filter((v) => restrictTo.includes(v));
    return values.length > 0 ? values : [...fallback];
    // `fallback` and `restrictTo` are module-level constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
}

// ---------------------------------------------------------------------------

type Draft = {
  customerSaysOnTime: boolean | null;
  delayReason: DelayReason | null;
  /** Scores by criterion key — the criteria are configurable rows. */
  ratings: Record<string, number>;
  overall: number | null;
  source: RatingSource;
  reorder: ReorderIntent;
  reorderNote: string;
  /** Free text for whatever the fixed fields do not cover. */
  notes: string;
  contactPerson: string;
  contactPhone: string;
};

export function FollowupPanel({
  followupId,
  row,
  canEdit,
  onClose,
  onSaved,
}: {
  followupId: string;
  /** The queue row. Absent on a deep link, where the detail supplies what it can. */
  row?: PanelRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const q = useQuery({
    queryKey: ["crm-followup", followupId],
    queryFn: () => apiGet<FollowupDetailJson>(`/api/crm/followups/${followupId}`),
  });

  const d = q.data;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  // The draft exactly as it arrived, so "unsaved changes" is a FACT rather than
  // a permanent warning. Saying "nothing is saved until you press Save" on an
  // untouched panel trains people to ignore the line that matters.
  const [pristine, setPristine] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!d) return;
    const f = d.followup;
    setDraft({
      customerSaysOnTime: f.customerSaysOnTime,
      delayReason: (f.delayReason as DelayReason | null) ?? null,
      ratings: { ...d.ratings },
      overall: f.ratingOverall,
      source: (f.ratingSource as RatingSource | null) ?? "coordinator",
      reorder: (f.reorderIntent as ReorderIntent) ?? "none",
      reorderNote: f.reorderNote ?? "",
      notes: f.notes ?? "",
      contactPerson: f.contactPerson ?? "",
      contactPhone: f.contactPhone ?? "",
    });
    setPristine(
      JSON.stringify({
        ratings: { ...d.ratings },
        overall: f.ratingOverall,
        source: f.ratingSource ?? "coordinator",
        onTime: f.customerSaysOnTime,
        delayReason: f.delayReason,
        reorder: f.reorderIntent ?? "none",
        reorderNote: f.reorderNote ?? "",
        notes: f.notes ?? "",
        contactPerson: f.contactPerson ?? "",
        contactPhone: f.contactPhone ?? "",
      }),
    );
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((p) => (p ? { ...p, [k]: v } : p));

  // The overall follows the sub-ratings until the coordinator overrides it.
  const subs = draft?.ratings ?? {};
  const suggested = deriveOverallRating(subs);
  const exact = overallRatingExact(subs);
  // Keyed on the SCORES themselves, not on named fields — the criteria are
  // configurable, so there is no fixed dependency list to write.
  const subsKey = JSON.stringify(subs);
  React.useEffect(() => {
    setDraft((p) => (p ? { ...p, overall: suggested } : p));
    // Only when a SUB-rating changes — a dependency on the whole draft would
    // fight a manual override the moment it was set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsKey]);

  // Every stage starts CLOSED. Auto-opening the first unfinished one dropped
  // the coordinator inside a form before she had seen what the call involved.
  const [stage, setStage] = React.useState<number | null>(null);

  const activeCriteria = (d?.criteria ?? []).filter((c) => c.isActive);
  const scoredActive = activeCriteria.filter(
    (c) => draft?.ratings[c.key] != null,
  ).length;
  const ratingsDone =
    activeCriteria.length > 0 && scoredActive === activeCriteria.length;

  const [channel, setChannel] = React.useState<AttemptChannel>("call");
  const [outcome, setOutcome] = React.useState<AttemptOutcome>("connected");
  const [attendedBy, setAttendedBy] = React.useState("");

  // Switching channel must not leave an outcome that channel cannot have — a
  // stale "Busy" surviving a switch to Visit would be submitted and rejected by
  // the API, which is a worse way to learn the rule than never seeing it.
  React.useEffect(() => {
    if (!CHANNEL_OUTCOMES[channel].includes(outcome)) {
      setOutcome(CHANNEL_OUTCOMES[channel][0]);
    }
  }, [channel, outcome]);

  const delayReasons = useLookupList(
    "CRM_DELAY_REASON",
    DELAY_REASONS,
    DELAY_REASONS,
  );
  const salesPeople = useLookupList("SALES_PERSON");

  const isUnreachable = d?.followup.status === "UNREACHABLE";
  // isReachedOutcome(), never `outcome === "connected"`: meeting someone in
  // person is the strongest contact there is, and treating it as anything less
  // would count a successful visit toward marking the customer unreachable.
  const connected = (d?.attempts ?? []).some((a) => isReachedOutcome(a.outcome));
  const attempted = (d?.attempts ?? []).length > 0;
  // The ONLY state in which giving up is wrong is one where somebody already
  // answered. Requiring a logged attempt first made the button permanently
  // disabled on a fresh follow-up — a control that is never available is not a
  // control, it is a puzzle.
  const unreachableReason = connected
    ? "Someone answered on this order — it cannot be unreachable."
    : null;
  const highIssue = (d?.issues ?? []).some((i) => i.severity === "HIGH");

  const attemptBlocked =
    channel === "visit" && outcome !== "not_available" && !attendedBy.trim()
      ? "Record who made the visit"
      : null;

  const logAttempt = useMutation({
    mutationFn: () =>
      apiSend(`/api/crm/followups/${followupId}/attempts`, "POST", {
        channel,
        outcome,
        attended_by: attendedBy.trim() || null,
        note: null,
      }),
    onSuccess: () => {
      setError(null);
      setStage(null);
      void q.refetch();
      onSaved?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  const save = useMutation({
    mutationFn: (status?: string) =>
      apiSend(`/api/crm/followups/${followupId}`, "PATCH", {
        status,
        customer_says_on_time: draft?.customerSaysOnTime,
        delay_reason: draft?.delayReason,
        ratings: draft?.ratings ?? {},
        rating_overall: draft?.overall,
        rating_source: draft?.source,
        reorder_intent: draft?.reorder,
        reorder_note: draft?.reorderNote || null,
        notes: draft?.notes || null,
        contact_person: draft?.contactPerson || null,
        contact_phone: draft?.contactPhone || null,
      }),
    onSuccess: () => {
      setError(null);
      void q.refetch();
      onSaved?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  // Marking unreachable with nothing logged writes the attempt FIRST, so
  // coverage still counts the try. A coordinator saying "I cannot reach them"
  // IS telling us they tried, and without the attempt row that silence would be
  // unmeasurable — the whole reason attempts are logged.
  const giveUp = async () => {
    if (!attempted) {
      const failed = channel === "visit" ? "not_available" : "no_answer";
      await apiSend(`/api/crm/followups/${followupId}/attempts`, "POST", {
        channel,
        outcome: failed,
        attended_by: null,
        note: "Marked unreachable without a separate attempt being logged",
      }).catch(() => null);
    }
    save.mutate("UNREACHABLE");
  };

  const busy = save.isPending || logAttempt.isPending;

  const current = draft
    ? JSON.stringify({
        ratings: draft.ratings,
        overall: draft.overall,
        source: draft.source,
        onTime: draft.customerSaysOnTime,
        delayReason: draft.delayReason,
        reorder: draft.reorder,
        reorderNote: draft.reorderNote,
        notes: draft.notes,
        contactPerson: draft.contactPerson,
        contactPhone: draft.contactPhone,
      })
    : null;
  const dirty = pristine !== null && current !== null && pristine !== current;

  const view: PanelRow | null = row ?? (d ? deriveRow(d) : null);
  const valueText =
    view && view.orderValue != null && view.orderValue > 0
      ? `₹${formatNumber(view.orderValue)}`
      : "—";

  return (
    <DraggablePanel
      tinted
      title={view ? `${view.orderNo} · ${view.partyName}` : "Follow-up"}
      subtitle={
        d && view
          ? `Attempt ${d.followup.attemptCount} · ${view.daysWaiting} days since delivery`
          : "Loading…"
      }
      // The two facts worth carrying in the chrome: where this follow-up
      // stands, and what the order is worth — the second is why a coordinator
      // decides how hard to chase it.
      headerAside={
        d ? (
          <>
            <span className="num hidden text-[13px] font-semibold text-accent-text sm:block">
              {valueText}
            </span>
            <Pill
              tone={
                d.followup.status === "COMPLETED"
                  ? "done"
                  : d.followup.status === "UNREACHABLE"
                    ? "warn"
                    : d.followup.status === "IN_PROGRESS"
                      ? "progress"
                      : "due"
              }
            >
              {STATUS_LABEL[d.followup.status as FollowupStatus] ??
                d.followup.status}
            </Pill>
          </>
        ) : null
      }
      onClose={onClose}
      footer={
        <>
          {/* A state machine, in priority order (§7.2.1). */}
          <span className="text-[12px] text-text-2">
            {d?.followup.isEscalated ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-status-red">
                <IconAlertTriangle className="size-3.5" />
                Flagged for principal review
              </span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-status-amber">
                <span className="size-1.5 rounded-full bg-status-amber" />
                Unsaved changes
              </span>
            ) : d?.followup.status === "COMPLETED" ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-status-green">
                <IconCheck className="size-3.5" />
                Completed
                {d.followup.completedBy ? ` by ${d.followup.completedBy}` : ""}
              </span>
            ) : (
              "Attempts and issues save immediately; the rest needs Save"
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="lg"
              disabled={!canEdit || busy}
              onClick={() => save.mutate(undefined)}
            >
              Save
            </Button>
            {/* Offering "Complete" on a completed follow-up is an action with
                nothing to do; once it is done the only thing worth offering is
                putting it back. */}
            {d?.followup.status === "COMPLETED" ? (
              <Button
                variant="outline"
                size="lg"
                disabled={!canEdit || busy}
                title="Put this back in the queue — the customer called again, or something was recorded wrongly"
                onClick={() => save.mutate("IN_PROGRESS")}
              >
                <IconRotateClockwise2 /> Reopen
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={!canEdit || busy || !draft?.overall || isUnreachable}
                title={
                  isUnreachable
                    ? "Reopen the follow-up first — there was no call to complete"
                    : draft?.overall
                      ? "Complete this follow-up"
                      : "An overall rating is required to complete"
                }
                onClick={() => save.mutate("COMPLETED")}
              >
                Complete
              </Button>
            )}
          </div>
        </>
      }
    >
      {!d || !draft || !view ? (
        <div className="px-4 py-10 text-center text-[13px] text-text-2">
          {q.isError ? (
            <>
              <div className="font-semibold text-status-red">
                Could not load this follow-up
              </div>
              <div className="mx-auto mt-1 max-w-[60ch] text-[12.5px] text-text-2">
                {(q.error as Error)?.message ?? "Unknown error"}
              </div>
              <button
                type="button"
                onClick={() => void q.refetch()}
                className="mt-3 cursor-pointer rounded-field border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-text-2 hover:bg-chip hover:text-text-1"
              >
                Try again
              </button>
            </>
          ) : (
            "Loading…"
          )}
        </div>
      ) : (
        // Left is what the coordinator READS before and during the call; right
        // is what they FILL IN. Stacked single-column below lg — a phone.
        <div className="grid items-start lg:grid-cols-[336px_1fr] lg:divide-x lg:divide-border">
          <div className="min-w-0 bg-surface-2/40">
            <Section n={1} title="Context">
              <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                <Fact
                  k="Order no"
                  v={<span className="num">{d.order.orderNo}</span>}
                />
                <Fact k="Order value" v={<span className="num">{valueText}</span>} />
                <Fact
                  k="OD date"
                  v={<span className="num">{formatDate(d.order.orderDate)}</span>}
                />
                <Fact
                  k="Delivered on"
                  v={
                    <span className="num">
                      {formatDate(d.followup.deliveredAt)}
                      <span className="ml-1 text-[12px] font-normal text-text-2">
                        {d.followup.deliveryBasis === "received_lr"
                          ? "· LR received"
                          : "· dispatch + transit"}
                      </span>
                    </span>
                  }
                />
                <Fact k="Sales person" v={d.order.salesPerson || "—"} />
                <Fact
                  k="Transport"
                  v={
                    d.order.transport || (
                      <span className="font-normal text-text-2">not recorded</span>
                    )
                  }
                />
                <Fact
                  wide
                  k="Qualities · designs"
                  v={
                    <span>
                      {view.qualities}{" "}
                      {view.qualities === 1 ? "quality" : "qualities"} ·{" "}
                      {view.designs} design{view.designs === 1 ? "" : "s"} —{" "}
                      <span className="num">{formatNumber(view.qtyMtr)} m</span>
                    </span>
                  }
                />
              </div>
            </Section>

            <Section n={2} title="What we already know">
              <div className="flex flex-col gap-1.5">
                <SlaVerdict sla={d.sla} />
                {view.hadOutOfStock ? (
                  <Know tone="plain" icon={<IconPackage />}>
                    <b>We ran out of stock</b> on one of the designs, which is
                    part of why this took longer.
                  </Know>
                ) : null}
                {view.hadCancellation ? (
                  <Know tone="plain" icon={<IconTruck />}>
                    <b>Some designs on this order were cancelled.</b> They may
                    bring it up — have the reason ready.
                  </Know>
                ) : null}
              </div>
            </Section>
          </div>

          {/* The five stages. One open at a time, each showing what it holds
              when closed, so progress through the call is visible without every
              control being on screen at once. */}
          <div className="min-w-0 border-t border-border py-1 lg:border-t-0 lg:border-l">
            {error ? (
              <div className="border-b border-border bg-status-red-dim px-5 py-2.5 text-[12.5px] font-medium text-status-red">
                {error}
              </div>
            ) : null}

            {isUnreachable ? (
              <div className="border-b border-border bg-status-amber-dim px-5 py-4">
                <div className="flex items-start gap-2.5">
                  <IconPhoneOff className="mt-0.5 size-4 shrink-0 text-status-amber" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-text-1">
                      Marked unreachable
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-text-2">
                      No conversation happened, so there is nothing to answer,
                      rate or promise. Anything already recorded is kept. Reopen
                      if they call back.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2.5"
                      disabled={!canEdit || busy}
                      onClick={() => save.mutate("IN_PROGRESS")}
                    >
                      <IconRotateClockwise2 /> Reopen follow-up
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <Stage
              n={1}
              title="Follow-up call attempt"
              done={d.attempts.length > 0}
              open={stage === 1}
              onToggle={() => setStage(stage === 1 ? null : 1)}
              summary={
                d.attempts.length === 0
                  ? "Nothing logged yet"
                  : `${d.attempts.length} logged · ${
                      OUTCOME_LABEL[d.attempts[0].outcome as AttemptOutcome] ??
                      d.attempts[0].outcome
                    }`
              }
            >
              <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-2 p-2">
                <Segmented
                  size="sm"
                  label="Channel"
                  value={channel}
                  onChange={(v) => setChannel(v as AttemptChannel)}
                  options={(["call", "whatsapp", "visit"] as AttemptChannel[]).map(
                    (c) => ({ value: c, label: CHANNEL_LABEL[c] }),
                  )}
                />
                {/* Outcomes follow the channel: a visit is never "busy" and a
                    WhatsApp is never "met at our office". The API enforces the
                    same pairing, so the UI is not the only thing keeping the
                    vocabulary honest. */}
                <select
                  className={selectCls}
                  aria-label="Outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as AttemptOutcome)}
                >
                  {CHANNEL_OUTCOMES[channel].map((v) => (
                    <option key={v} value={v}>
                      {OUTCOME_LABEL[v]}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || busy || attemptBlocked !== null}
                  title={attemptBlocked ?? "Log this attempt"}
                  onClick={() => logAttempt.mutate()}
                >
                  <IconPlus /> Log
                </Button>
              </div>

              {/* A visit was made by somebody, and "who went?" is the first
                  question asked about it later. The coordinator recording it is
                  routinely not the person who went. */}
              {channel === "visit" && outcome !== "not_available" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-[12px] text-text-2">Visited by</label>
                  <Autocomplete
                    value={attendedBy}
                    onValueChange={setAttendedBy}
                    suggestions={salesPeople}
                    placeholder="Who made the visit?"
                    className="h-9 min-w-[200px] flex-1"
                  />
                </div>
              ) : null}

              {d.attempts.length > 0 ? (
                <ul className="mt-2.5 flex flex-col gap-1">
                  {d.attempts.slice(0, 3).map((a, i) => (
                    <li key={a.id} className="text-[12px] text-text-2">
                      Attempt {d.attempts.length - i} ·{" "}
                      <span className="num">{formatDateTime(a.attemptedAt)}</span>{" "}
                      — {OUTCOME_LABEL[a.outcome as AttemptOutcome] ?? a.outcome}
                      {a.attendedBy ? ` · by ${a.attendedBy}` : ""}
                      {a.createdBy ? ` · logged by ${a.createdBy}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2.5 text-[12px] text-text-2">
                  No attempt logged yet. Log the unanswered ones too — coverage
                  is unmeasurable without them.
                </p>
              )}

              {/* Giving up belongs HERE, under the attempts that justify it —
                  not in the footer beside Save and Complete, where it read as a
                  third way to finish a call that was never had. It is the
                  CONCLUSION drawn from the log, so it sits below it. */}
              {!isUnreachable ? (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                  <span className="text-[12px] text-text-2">
                    {unreachableReason ??
                      (attempted
                        ? "Tried enough times?"
                        : "Tried and got nowhere? This logs the attempt too.")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-status-amber hover:bg-status-amber-dim"
                    disabled={!canEdit || busy || unreachableReason !== null}
                    title={
                      unreachableReason ??
                      (attempted
                        ? "Give up on this one — no answer after repeated attempts"
                        : "Records a failed attempt and gives up on this one")
                    }
                    onClick={() => void giveUp()}
                  >
                    <IconPhoneOff /> Can&rsquo;t reach
                  </Button>
                </div>
              ) : null}
            </Stage>

            <Stage
              n={2}
              title="Issues or complaints"
              done={draft.customerSaysOnTime !== null || d.issues.length > 0}
              open={stage === 2}
              disabled={isUnreachable}
              onToggle={() => setStage(stage === 2 ? null : 2)}
              summary={(() => {
                // The stage is named for complaints, so the summary leads with
                // them; the on-time answer follows, since late delivery is
                // itself the most common complaint.
                const n = d.issues.length;
                const raised =
                  n === 0
                    ? "No issues raised"
                    : `${n} issue${n === 1 ? "" : "s"} raised`;
                if (draft.customerSaysOnTime === null) {
                  return n === 0 ? "Nothing recorded yet" : raised;
                }
                return `${raised} · they said it ${
                  draft.customerSaysOnTime ? "arrived on time" : "was late"
                }`;
              })()}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 rounded-field bg-surface-2 px-3 py-2.5">
                  <span className="text-[12.5px] font-medium text-text-1">
                    Did it reach on time?
                  </span>
                  <Segmented
                    size="sm"
                    tone={
                      draft.customerSaysOnTime === false ? "negative" : "positive"
                    }
                    label="Customer says on time"
                    value={
                      draft.customerSaysOnTime === null
                        ? ""
                        : draft.customerSaysOnTime
                          ? "yes"
                          : "no"
                    }
                    onChange={(v) => set("customerSaysOnTime", v === "yes")}
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                  />
                </div>

                {draft.customerSaysOnTime === false ? (
                  <div className="flex items-center justify-between gap-3 rounded-field bg-surface-2 px-3 py-2.5">
                    <span className="text-[12.5px] font-medium text-text-1">
                      Reason for the delay
                    </span>
                    <select
                      className={selectCls}
                      aria-label="Reason for the delay"
                      value={draft.delayReason ?? ""}
                      onChange={(e) =>
                        set(
                          "delayReason",
                          (e.target.value || null) as DelayReason | null,
                        )
                      }
                    >
                      <option value="">Not stated</option>
                      {delayReasons.map((r) => (
                        <option key={r} value={r}>
                          {DELAY_REASON_LABEL[r as DelayReason] ?? r}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <IssueList
                followupId={followupId}
                lines={d.lines}
                issues={d.issues}
                canEdit={canEdit}
                onChanged={() => {
                  void q.refetch();
                  onSaved?.();
                }}
              />
            </Stage>

            {/* The fixed fields cannot anticipate everything a customer says,
                and without somewhere to put the rest it goes unrecorded.
                Optional by design — it must never stand between a coordinator
                and finishing the call. */}
            <Stage
              n={3}
              title="Feedback"
              done={!!draft.notes.trim()}
              open={stage === 3}
              disabled={isUnreachable}
              onToggle={() => setStage(stage === 3 ? null : 3)}
              summary={
                draft.notes.trim()
                  ? draft.notes.trim()
                  : "Optional — anything else they said"
              }
            >
              <textarea
                rows={4}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="In their own words — what they praised, what annoyed them, anything the questions above did not cover."
                className="w-full resize-y rounded-field border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-text-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              />
              <p className="mt-1.5 text-[12px] text-text-2">
                Saved with the follow-up and shown on the customer&rsquo;s
                history.
              </p>
            </Stage>

            <Stage
              n={4}
              title="Ratings"
              done={ratingsDone}
              open={stage === 4}
              disabled={isUnreachable}
              onToggle={() => setStage(stage === 4 ? null : 4)}
              summary={
                scoredActive === 0
                  ? `Not rated — ${activeCriteria.length} criteria`
                  : ratingsDone
                    ? `${exact !== null ? exact.toFixed(1) : draft.overall} out of 5 · all ${activeCriteria.length} scored`
                    : `Part rated — ${scoredActive} of ${activeCriteria.length} scored`
              }
            >
              <p className="mb-2 text-[12px] text-text-2">
                Press 1&ndash;5 with a row focused.
              </p>
              {d.criteria.length === 0 ? (
                <p className="py-2 text-[12.5px] text-text-2">
                  No rating criteria are configured. An admin can add them in
                  Settings → CRM.
                </p>
              ) : (
                d.criteria.map((c) => (
                  <div
                    key={c.key}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-field px-2 py-2 transition-colors not-last:border-b not-last:border-border/60 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium text-text-1">
                        {c.label}
                      </span>
                      {c.hint ? (
                        <span className="ml-1.5 text-[11px] text-text-2">
                          {c.hint}
                        </span>
                      ) : null}
                      {/* A retired criterion only appears when this call already
                          scored it, so the old score stays readable. */}
                      {!c.isActive ? (
                        <span className="ml-1.5 text-[11px] text-text-2 italic">
                          retired
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* text-transparent when unscored, so the column never
                          shifts as scores are given. */}
                      <span
                        className={cn(
                          "num w-3 text-right text-[12.5px] font-semibold",
                          draft.ratings[c.key] ? "text-text-1" : "text-transparent",
                        )}
                      >
                        {draft.ratings[c.key] ?? 0}
                      </span>
                      <StarPicker
                        label={c.label}
                        size={17}
                        disabled={!canEdit}
                        value={draft.ratings[c.key] ?? null}
                        onChange={(v) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  ratings: (() => {
                                    const next = { ...prev.ratings };
                                    // null DELETES the key rather than storing
                                    // a zero — a zero reads as "they scored us
                                    // zero".
                                    if (v === null) delete next[c.key];
                                    else next[c.key] = v;
                                    return next;
                                  })(),
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>
                ))
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card border border-border bg-chip px-3.5 py-3">
                <div>
                  <div className="text-[11px] font-medium tracking-[0.07em] text-text-2 uppercase">
                    Overall &middot; suggested, editable
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <StarPicker
                      label="Overall"
                      size={19}
                      disabled={!canEdit}
                      value={draft.overall}
                      onChange={(v) => set("overall", v)}
                    />
                    <span className="num text-[22px] leading-none font-semibold tracking-[-0.02em] text-text-1">
                      {exact !== null ? exact.toFixed(1) : "—"}
                    </span>
                  </div>
                </div>
                <Segmented
                  size="sm"
                  label="Rating source"
                  value={draft.source}
                  onChange={(v) => set("source", v as RatingSource)}
                  options={[
                    { value: "coordinator", label: "Coordinator judged" },
                    { value: "customer", label: "Customer stated" },
                  ]}
                />
              </div>

              {(draft.overall !== null && draft.overall <= 2) || highIssue ? (
                <div className="mt-2.5">
                  <Know tone="bad" icon={<IconAlertTriangle />}>
                    {highIssue
                      ? "A high-severity issue is open"
                      : "Overall rating is 2 or below"}{" "}
                    — this will be <strong>flagged for principal review</strong>.
                  </Know>
                </div>
              ) : null}
            </Stage>

            <Stage
              n={5}
              last
              title="New requirement"
              done={draft.reorder !== "none" || d.followup.status === "COMPLETED"}
              open={stage === 5}
              disabled={isUnreachable}
              onToggle={() => setStage(stage === 5 ? null : 5)}
              summary={
                draft.reorder === "none"
                  ? "None"
                  : draft.reorder === "sample_requested"
                    ? "Asked for a sample"
                    : draft.reorder === "yes"
                      ? "Buying again"
                      : "Maybe buying again"
              }
            >
              {/* The commercial half of the call. A post-delivery conversation
                  reaches a customer at their warmest all quarter, so this is
                  not an afterthought — it is the line that pays for the call. */}
              <p className="mb-2 text-[12.5px] text-text-2">
                Are they buying again?
              </p>
              <Segmented
                size="sm"
                label="Reorder intent"
                value={draft.reorder}
                onChange={(v) => set("reorder", v as ReorderIntent)}
                options={[
                  { value: "none", label: "None" },
                  { value: "maybe", label: "Maybe" },
                  { value: "yes", label: "Yes" },
                  { value: "sample_requested", label: "Sample" },
                ]}
              />
              {draft.reorder !== "none" ? (
                <>
                  <Input
                    className="mt-2.5 h-9"
                    value={draft.reorderNote}
                    onChange={(e) => set("reorderNote", e.target.value)}
                    placeholder="What did they ask for?"
                  />
                  <p className="mt-1.5 text-[12px] text-text-2">
                    Goes to the sales reorder list
                    {d.order.salesPerson ? `, tagged to ${d.order.salesPerson}` : ""}.
                  </p>
                </>
              ) : null}
            </Stage>
          </div>
        </div>
      )}
    </DraggablePanel>
  );
}

// ---------------------------------------------------------------------------

/**
 * The SLA verdict, in plain English (§7.2.2).
 *
 * Written for a coordinator on a phone call, not for a developer. It used to
 * read *"Order Entry ran 60.3 days late against a 8-day target (7 stages
 * missed: Order Entry +60.3d…)"* — every fact in that was true and none of it
 * was usable. What a caller needs is: what we promised, what happened, how far
 * apart they are, and whether to trust it.
 */
function SlaVerdict({ sla }: { sla: FollowupDetailJson["sla"] }) {
  const rows = sla ?? [];
  const late = rows
    .filter((r) => r.lateMinutes > 0)
    .sort((a, b) => b.lateMinutes - a.lateMinutes);
  // Rounded to whole days with a floor of 1 — never raw minutes.
  const days = (m: number) => Math.max(1, Math.round(m / 1440));
  const started = rows.filter((r) => r.done > 0);
  const dispatch = rows.find((r) => r.stageKey === "dispatch");

  if (started.length === 0) {
    return (
      <Know tone="plain" icon={<IconPackage />}>
        <b className="text-text-1">Nothing has been ticked yet</b> on this
        order, so we cannot say whether it was on time.
      </Know>
    );
  }

  if (late.length === 0) {
    return (
      <Know tone="ok" icon={<IconCheck />}>
        <b>Every step was finished on time.</b>
        {dispatch ? (
          <>
            {" "}
            Our plan allows <b>{dispatch.targetDays} days</b> from the order
            date to dispatch, and we stayed inside it.
          </>
        ) : null}
      </Know>
    );
  }

  const worst = late[0];
  const lateDays = days(worst.lateMinutes);
  const took = worst.targetDays + lateDays;
  return (
    <Know tone="bad" icon={<IconAlertTriangle />}>
      <b className="text-[13px]">This order was late.</b>
      <ul className="mt-2 flex flex-col gap-1.5">
        <li className="flex gap-2">
          <span className="w-[86px] shrink-0 text-text-2">We planned</span>
          <span>
            <b>{worst.label}</b> within{" "}
            <b className="num">{worst.targetDays} days</b> of the order date
          </span>
        </li>
        <li className="flex gap-2">
          <span className="w-[86px] shrink-0 text-text-2">It took</span>
          <span>
            about <b className="num">{took} days</b>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="w-[86px] shrink-0 text-text-2">So we were</span>
          <span>
            <b className="num">{lateDays} days</b> later than planned
          </span>
        </li>
        <li className="flex gap-2">
          <span className="w-[86px] shrink-0 text-text-2">Steps late</span>
          <span>
            <b className="num">{late.length}</b> of{" "}
            <b className="num">{rows.length}</b>
            {late.length > 1 ? (
              <span className="text-text-2">
                {" "}
                — {late.slice(0, 3).map((r) => r.label).join(", ")}
                {late.length > 3 ? " and more" : ""}
              </span>
            ) : null}
          </span>
        </li>
      </ul>
      <p className="mt-2.5 border-t border-status-red/20 pt-2 text-[12px] leading-relaxed text-text-2">
        This is against <b>our own plan</b>. The customer may still feel it
        arrived on time — ask them, do not assume.
      </p>
    </Know>
  );
}

// ---------------------------------------------------------------------------

function IssueList({
  followupId,
  lines,
  issues,
  canEdit,
  onChanged,
}: {
  followupId: string;
  lines: FollowupDetailJson["lines"];
  issues: FollowupDetailJson["issues"];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [lineId, setLineId] = React.useState("");
  // A DROPDOWN, with "Other" as the escape hatch — not a free-text box. Free
  // text was tried and was wrong: the field looked like a plain input, so the
  // categories already on file were invisible and every coordinator would have
  // coined their own wording for the same complaint. Picking is the common
  // case; typing is the exception, and it must look like one.
  const OTHER = "__other__";
  const [category, setCategory] = React.useState<string>("");
  const [otherCategory, setOtherCategory] = React.useState("");
  const [severity, setSeverity] = React.useState<IssueSeverity>("MEDIUM");
  const [dept, setDept] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const categories = useLookupList("CRM_ISSUE", DEFAULT_ISSUE_CATEGORIES);
  const depts = useLookupList("CRM_DEPT", OWNER_DEPTS, OWNER_DEPTS);

  React.useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [categories, category]);
  React.useEffect(() => {
    if (!dept && depts.length) setDept(depts[0]);
  }, [depts, dept]);

  // "Other" is a UI affordance, NEVER a stored value — what lands in the
  // database is the words the coordinator actually typed, and the issues API
  // adds them to the master list so the next call is offered them.
  const chosenCategory = category === OTHER ? otherCategory.trim() : category;

  const create = useMutation({
    mutationFn: () =>
      apiSend("/api/crm/issues", "POST", {
        followup_id: followupId,
        order_line_item_id: lineId || null,
        category: chosenCategory,
        severity,
        owner_dept: dept || null,
        qty_affected: qty ? Number(qty) : null,
        description: desc || null,
      }),
    onSuccess: () => {
      setError(null);
      setAdding(false);
      setQty("");
      setDesc("");
      setLineId("");
      setOtherCategory("");
      onChanged();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mt-3">
      {issues.map((i, n) => (
        <div
          key={i.id}
          className="mb-2 rounded-field border border-status-red/40 bg-status-red-dim p-2.5"
        >
          <div className="mb-1 flex items-center gap-2">
            <Pill tone={i.severity === "HIGH" ? "late" : "warn"}>
              {i.severity === "HIGH"
                ? "High"
                : i.severity === "MEDIUM"
                  ? "Medium"
                  : "Low"}
            </Pill>
            <strong className="text-[12.5px] text-text-1">
              {categoryLabel(i.category)}
            </strong>
            <span className="ml-auto text-[12px] text-text-2">
              Issue #{n + 1}
            </span>
          </div>
          <div className="text-[12px] text-text-2">
            {i.quality ? (
              <>
                {i.quality} · <span className="num">{i.designNo}</span>
              </>
            ) : (
              "Whole order"
            )}
            {i.qtyAffected ? (
              <>
                {" "}
                —{" "}
                <span className="num">
                  {formatNumber(Number(i.qtyAffected))} m
                </span>
              </>
            ) : null}
            {i.ownerDept ? ` · ${i.ownerDept}` : ""}
          </div>
          {i.description ? (
            <p className="mt-1 text-[12.5px] text-text-1">{i.description}</p>
          ) : null}
        </div>
      ))}

      {adding ? (
        <div className="rounded-card border border-border bg-surface-2 p-3">
          <div className="mb-2.5 text-[12px] font-semibold tracking-[0.06em] text-text-2 uppercase">
            New issue
          </div>

          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="What went wrong">
              <select
                className={cn(selectCls, "w-full")}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
                {/* The escape hatch. Anything typed under it is added to the
                    master list by the issues API, so the next coordinator picks
                    it instead of inventing a second wording for the same
                    complaint. */}
                <option value={OTHER}>Other — type it in…</option>
              </select>
            </Field>

            <Field label="Which design" span2>
              <select
                className={cn(selectCls, "w-full")}
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
              >
                <option value="">Whole order (no design)</option>
                {lines
                  .filter((l) => !l.isCancelled)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.quality} · {l.designNo}
                    </option>
                  ))}
              </select>
            </Field>

            {category === OTHER ? (
              <Field
                label="Name the problem"
                hint="Saved to the list for everyone"
                wide
              >
                <Input
                  autoFocus
                  className="h-8 w-full text-[12.5px]"
                  value={otherCategory}
                  onChange={(e) => setOtherCategory(e.target.value)}
                  placeholder="e.g. Roll length short"
                />
              </Field>
            ) : null}

            <Field label="Severity">
              <select
                className={cn(selectCls, "w-full")}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
              >
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s === "HIGH" ? "High" : s === "MEDIUM" ? "Medium" : "Low"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Whose to fix">
              <select
                className={cn(selectCls, "w-full")}
                value={dept}
                onChange={(e) => setDept(e.target.value)}
              >
                {depts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Meters" hint="optional">
              <Input
                className="h-8 w-full text-[12.5px]"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 120"
                inputMode="decimal"
              />
            </Field>

            <Field label="What happened" hint="optional" wide>
              <Input
                className="h-8 w-full text-[12.5px]"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Two thans water-stained at the edges…"
              />
            </Field>
          </div>

          {error ? (
            <p className="mt-2 text-[12px] font-medium text-status-red">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setOtherCategory("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={create.isPending || !chosenCategory}
              title={chosenCategory ? "Raise this issue" : "Name the problem first"}
              onClick={() => create.mutate()}
            >
              Add issue
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setAdding(true)}
          className="w-full cursor-pointer rounded-field border border-dashed border-border-strong py-2 text-[12.5px] font-medium text-text-2 transition-colors hover:border-primary hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add {issues.length > 0 ? "another " : ""}issue
        </button>
      )}
    </div>
  );
}
