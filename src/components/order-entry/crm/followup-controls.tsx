"use client";

// Ratings + status/reorder/notes, all bundled into ONE PATCH — they are all
// part of followupUpdateSchema on the server, and the source panel treats
// them as one save. Attempts and issues are events (posted immediately by
// their own components); this is the "batched" half of the follow-up.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DELAY_REASONS,
  DELAY_REASON_LABEL,
  FOLLOWUP_STATUSES,
  RATING_SOURCES,
  REORDER_INTENTS,
  STATUS_LABEL,
  deriveOverallRating,
  type DelayReason,
  type FollowupStatus,
  type RatingSource,
  type ReorderIntent,
} from "@/lib/order-entry/crm";

const selectCls =
  "h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[13px] text-text-1 outline-none focus-visible:border-ring";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3";
const cardCls = "rounded-[10px] border border-border bg-surface px-5 py-[18px]";

const REORDER_LABEL: Record<ReorderIntent, string> = {
  none: "None",
  maybe: "Maybe",
  yes: "Buying again",
  sample_requested: "Sample requested",
};

function StarRow({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md border text-[12.5px] font-semibold transition-colors",
            value !== null && n <= value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface-2 text-text-3 hover:text-text-1",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function FollowupControls({
  followupId,
  canEdit,
  status: initialStatus,
  criteria,
  ratings: initialRatings,
  ratingOverall,
  ratingSource,
  customerSaysOnTime: initialOnTime,
  delayReason: initialDelayReason,
  reorderIntent: initialReorderIntent,
  reorderNote: initialReorderNote,
  notes: initialNotes,
}: {
  followupId: string;
  canEdit: boolean;
  status: FollowupStatus;
  criteria: {
    key: string;
    label: string;
    hint: string | null;
    sortOrder: number;
    isActive: boolean;
  }[];
  ratings: Record<string, number>;
  ratingOverall: number | null;
  ratingSource: RatingSource | null;
  customerSaysOnTime: boolean | null;
  delayReason: DelayReason | null;
  reorderIntent: ReorderIntent;
  reorderNote: string | null;
  notes: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<FollowupStatus>(initialStatus);
  const [subRatings, setSubRatings] = useState<Record<string, number>>(initialRatings);
  const [overall, setOverall] = useState<number | null>(ratingOverall);
  const [source, setSource] = useState<RatingSource>(ratingSource ?? "coordinator");
  const [onTime, setOnTime] = useState<boolean | null>(initialOnTime);
  const [delayReason, setDelayReason] = useState<DelayReason | null>(initialDelayReason);
  const [reorder, setReorder] = useState<ReorderIntent>(initialReorderIntent);
  const [reorderNote, setReorderNote] = useState(initialReorderNote ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");

  // The overall follows the sub-ratings until overridden — same rule as the
  // source panel: touching a sub-rating re-derives the suggestion, so a stale
  // manual override cannot silently survive a changed set of scores.
  function setStar(key: string, v: number) {
    const next = { ...subRatings, [key]: v };
    setSubRatings(next);
    const suggested = deriveOverallRating(next);
    if (suggested !== null) setOverall(suggested);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/crm/followups/${followupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ratings: subRatings,
          rating_overall: overall,
          rating_source: source,
          customer_says_on_time: onTime,
          delay_reason: onTime === false ? delayReason : null,
          reorder_intent: reorder,
          reorder_note: reorderNote.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not save the follow-up");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={cardCls}>
        <h2 className="mb-3.5 text-[14.5px] font-bold text-text-1">Ratings</h2>
        {criteria.length === 0 ? (
          <p className="text-[13px] text-text-3">No rating criteria are configured.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {criteria.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-text-1">
                    {c.label}
                    {!c.isActive && (
                      <span className="ml-1.5 text-[11px] italic text-text-3">retired</span>
                    )}
                  </div>
                  {c.hint && <div className="text-[11.5px] text-text-3">{c.hint}</div>}
                </div>
                <StarRow
                  value={subRatings[c.key] ?? null}
                  disabled={!canEdit}
                  onChange={(v) => setStar(c.key, v)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/60 px-3.5 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.04em] text-text-3">
              Overall · suggested, editable
            </div>
            <div className="mt-1">
              <StarRow value={overall} disabled={!canEdit} onChange={setOverall} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Rating source</label>
            <select
              className={selectCls}
              value={source}
              disabled={!canEdit}
              onChange={(e) => setSource(e.target.value as RatingSource)}
            >
              {RATING_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s === "customer" ? "Customer stated" : "Coordinator judged"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="mb-3.5 text-[14.5px] font-bold text-text-1">Status &amp; feedback</h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Status</label>
            <select
              className={selectCls}
              value={status}
              disabled={!canEdit}
              onChange={(e) => setStatus(e.target.value as FollowupStatus)}
            >
              {FOLLOWUP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Did it reach on time?</label>
            <select
              className={selectCls}
              value={onTime === null ? "" : onTime ? "yes" : "no"}
              disabled={!canEdit}
              onChange={(e) =>
                setOnTime(e.target.value === "" ? null : e.target.value === "yes")
              }
            >
              <option value="">Not asked</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          {onTime === false && (
            <div>
              <label className={labelCls}>Reason for the delay</label>
              <select
                className={selectCls}
                value={delayReason ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  setDelayReason((e.target.value || null) as DelayReason | null)
                }
              >
                <option value="">Not stated</option>
                {DELAY_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {DELAY_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Reorder intent</label>
            <select
              className={selectCls}
              value={reorder}
              disabled={!canEdit}
              onChange={(e) => setReorder(e.target.value as ReorderIntent)}
            >
              {REORDER_INTENTS.map((r) => (
                <option key={r} value={r}>
                  {REORDER_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {reorder !== "none" && (
            <div className="sm:col-span-2">
              <label className={labelCls}>What did they ask for?</label>
              <Input
                value={reorderNote}
                disabled={!canEdit}
                onChange={(e) => setReorderNote(e.target.value)}
                placeholder="optional"
                className="text-[13px]"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className={labelCls}>Coordinator notes</label>
            <textarea
              rows={4}
              value={notes}
              disabled={!canEdit}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="In their own words — what they praised, what annoyed them, anything else."
              className="w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-1 outline-none focus-visible:border-ring disabled:opacity-60"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3.5 rounded-lg border border-status-red/30 bg-status-red-dim px-3.5 py-2.5 text-[13px] text-status-red">
            {error}
          </div>
        )}

        {canEdit && (
          <div className="mt-3.5 flex justify-end">
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
