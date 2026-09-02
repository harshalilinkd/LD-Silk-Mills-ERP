"use client";

// Logs one call/whatsapp/visit/email attempt against a follow-up — an EVENT,
// posted the moment it happens (unlike the status/ratings/notes form, which
// batches into one PATCH). Mirrors the cancel-order-button.tsx mutation
// pattern: useTransition + fetch, surface {error} on failure, router.refresh()
// on success.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ATTEMPT_CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_OUTCOMES,
  OUTCOME_LABEL,
  type AttemptChannel,
  type AttemptOutcome,
} from "@/lib/order-entry/crm";

const selectCls =
  "h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[13px] text-text-1 outline-none focus-visible:border-ring";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3";

export function AttemptForm({ followupId }: { followupId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState<AttemptChannel>("call");
  const [outcome, setOutcome] = useState<AttemptOutcome>(CHANNEL_OUTCOMES.call[0]);
  const [attendedBy, setAttendedBy] = useState("");
  const [note, setNote] = useState("");

  // Switching channel must not leave an outcome that channel cannot have —
  // the API enforces the same pairing (CHANNEL_OUTCOMES), so this just
  // avoids a guaranteed-to-fail submit.
  function changeChannel(next: AttemptChannel) {
    setChannel(next);
    if (!CHANNEL_OUTCOMES[next].includes(outcome)) {
      setOutcome(CHANNEL_OUTCOMES[next][0]);
    }
  }

  const needsAttendedBy = channel === "visit" && outcome !== "not_available";

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/crm/followups/${followupId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          outcome,
          attended_by: attendedBy.trim() || null,
          note: note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not log the attempt");
        return;
      }
      setAttendedBy("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls}>Channel</label>
          <select
            className={selectCls}
            value={channel}
            onChange={(e) => changeChannel(e.target.value as AttemptChannel)}
          >
            {ATTEMPT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Outcome</label>
          <select
            className={selectCls}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as AttemptOutcome)}
          >
            {CHANNEL_OUTCOMES[channel].map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Attended by{needsAttendedBy ? " *" : ""}</label>
          <Input
            value={attendedBy}
            onChange={(e) => setAttendedBy(e.target.value)}
            placeholder={needsAttendedBy ? "Who made the visit?" : "optional"}
            className="text-[13px]"
          />
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className="text-[13px]"
          />
        </div>
      </div>

      {error && <p className="text-[12px] text-status-red">{error}</p>}

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={isPending || (needsAttendedBy && !attendedBy.trim())}
          title={
            needsAttendedBy && !attendedBy.trim()
              ? "Record who made the visit"
              : "Log this attempt"
          }
          onClick={submit}
        >
          {isPending ? "Logging…" : "Log attempt"}
        </Button>
      </div>
    </div>
  );
}
