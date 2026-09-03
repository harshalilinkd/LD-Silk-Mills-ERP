"use client";

import * as React from "react";

import { Bi } from "@/components/help-slip/bilingual";
import { HsModal, SolutionList } from "@/components/help-slip/concern-parts";
import { TextAreaField } from "@/components/help-slip/form-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RESOLUTION_MIN } from "@/lib/help-slip/state-machine";
import {
  MESSAGE_MAX,
  type ConcernSolutionRow,
} from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The notification quotes the first 160 characters. `notify_on_resolve` does
 * `left(resolution_message, 160)`, so the preview has to cut at the same place
 * or it is not a preview.
 */
const NOTIFICATION_CHARS = 160;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Resolving a concern.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's
 * `src/features/concerns/components/ResolveDialog.tsx`.
 *
 * The solution picker is the reason this is a dialog and not an inline
 * textarea. The paper slip asked the employee for up to three fixes, and this
 * is the one moment in the product where somebody answers them — picking one
 * prefills the message with "Accepted: <their words>", which the coordinator
 * then edits. A fourth option says they solved it another way, because
 * pretending otherwise would corrupt the only management data this app
 * collects that is worth having.
 *
 * The PREVIEW LINE is the cheapest quality control here: showing the
 * coordinator the sentence the employee will actually receive stops most bad
 * resolution messages before they are sent.
 *
 * ── ONE CONTAINER, NOT TWO ────────────────────────────────────────────────
 *
 * The source branches its container on a media query — a 440px modal on
 * desktop, a full-height sheet on a phone — and says so at length. This port
 * keeps ONE container: `HsModal`, which is already `max-h-[85vh]` and scrolls,
 * and which every other prompt on the workspace uses. The reason is not
 * laziness: branching needs a `useMediaQuery`, this shell has none, and Base
 * UI's is still marked unstable. The CONTENT — which is what the source says
 * must not fork — is identical either way.
 */
export function ResolveDialog({
  open,
  onOpenChange,
  employeeName,
  solutions,
  /** Pre-selected from the workspace's own picker, if they chose there. */
  initialSolutionId,
  onResolve,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  solutions: ConcernSolutionRow[];
  initialSolutionId?: string | null;
  onResolve: (input: {
    resolution: string;
    acceptedSolutionId: string | null;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [choice, setChoice] = React.useState<string | null>(
    initialSolutionId ?? null,
  );
  const [message, setMessage] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);

  /**
   * Reset on OPEN, not on close.
   *
   * Resetting on close would wipe the text while the dialog is still animating
   * out, which the coordinator sees. And a resolve that FAILED must keep what
   * they wrote — losing a paragraph to a dropped connection is how somebody
   * stops trusting a form.
   */
  React.useEffect(() => {
    if (!open) return;
    const start = initialSolutionId ?? null;
    setChoice(start);
    setMessage(start ? prefill(solutions, start) : "");
    setTouched(false);
    // Deliberately keyed on `open` alone: re-running when `solutions` or the
    // initial id change would overwrite the coordinator's typing mid-sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Picking a solution PREFILLS; it does not overwrite work.
   *
   * If the coordinator has already typed something of their own, changing the
   * selection leaves it alone — the prefill is a shortcut, and a shortcut that
   * eats a paragraph is worse than no shortcut. It only fills an empty box, or
   * one still holding an untouched prefill.
   */
  const pick = (next: string | null) => {
    const wasPrefill = choice !== null && message === prefill(solutions, choice);
    setChoice(next);
    if (message.trim() === "" || wasPrefill) {
      setMessage(next ? prefill(solutions, next) : "");
    }
  };

  /**
   * Has anything been WRITTEN that would be lost?
   *
   * Compared against the prefill, not against empty. Picking "2nd solution"
   * and changing your mind has cost nobody anything — the box holds words the
   * app put there. Asking "discard your changes?" about text the user did not
   * type is the confirmation that teaches people to dismiss confirmations.
   */
  const prefilled = choice === null ? "" : prefill(solutions, choice);
  const dirty = message.trim() !== prefilled.trim();

  /**
   * Escape, the backdrop and the browser's back gesture all arrive here as one
   * close request. Guarding at the CONTAINER covers every route out, which a
   * guard on a Cancel button does not.
   */
  const requestClose = () => {
    if (dirty && !pending) {
      setConfirmingDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const trimmed = message.trim();
  const tooShort = trimmed.length < RESOLUTION_MIN;
  const fieldError =
    touched && tooShort
      ? `Write at least ${RESOLUTION_MIN} characters — "done" is not an answer.`
      : undefined;

  const submit = () => {
    setTouched(true);
    if (tooShort) return;
    onResolve({ resolution: trimmed, acceptedSolutionId: choice });
  };

  return (
    <>
      <HsModal
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestClose();
        }}
        titleEn="Resolve this concern"
        titleHi="यह शिकायत हल करें"
        descriptionEn={`${employeeName} will be notified.`}
        descriptionHi={`${employeeName} को सूचना भेजी जाएगी।`}
        error={error}
        footer={
          // 44px + 16px text below md: the minimum touch target for a phone
          // held on the factory floor, and anything under 16px makes iOS
          // Safari auto-zoom on focus and never zoom back out. ERP-compact
          // (36px / 13px) from md up.
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              disabled={pending}
              onClick={requestClose}
            >
              <Bi en="Cancel" hi="रद्द करें" />
            </Button>
            <Button
              type="button"
              className="h-11 md:h-9"
              disabled={pending}
              onClick={submit}
            >
              {pending ? <Spinner /> : null}
              <Bi en="Resolve concern" hi="शिकायत हल करें" />
            </Button>
          </>
        }
      >
        {/* ── step 1: which of THEIR solutions worked ─────────────────── */}
        <div className="flex flex-col gap-2">
          <span
            id="resolve-which"
            className={cn("deva text-text-1", T.label)}
          >
            Which solution worked?
            <span className="deva hi"> (कौन सा समाधान काम आया?)</span>
          </span>

          {/* The same component the employee reads their own solutions in,
              made selectable — one list, two modes. Clicking the chosen one
              again clears it, which IS "resolved another way". */}
          <SolutionList
            solutions={solutions}
            acceptedId={null}
            pickedId={choice}
            onPick={pick}
            disabled={pending}
            labelledBy="resolve-which"
          />

          {/* The fourth option, and it has to exist: pretending one of their
              suggestions was used when it was not corrupts the only management
              data this app collects that is worth having. */}
          <button
            type="button"
            disabled={pending}
            onClick={() => pick(null)}
            aria-pressed={choice === null}
            className={cn(
              "flex w-full cursor-pointer flex-col gap-0.5 rounded-card border p-3 text-left transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/40",
              "disabled:cursor-not-allowed disabled:opacity-60",
              choice === null
                ? "border-primary bg-accent"
                : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            <span className={cn("deva text-text-1", T.label)}>
              <Bi en="Resolved another way" hi="किसी और तरीके से हल हुआ" />
            </span>
            <span className={cn("deva text-text-3", T.caption)}>
              <Bi
                en="None of their suggestions were used."
                hi="इनमें से कोई सुझाव इस्तेमाल नहीं हुआ।"
              />
            </span>
          </button>
        </div>

        {/* ── step 2: what actually happened ──────────────────────────── */}
        <TextAreaField
          id="resolve-message"
          labelEn="How was it resolved?"
          labelHi="यह कैसे हल हुआ?"
          helperEn="Write what actually happened. This is the whole answer they get."
          helperHi="जो सच में हुआ वही लिखें। उन्हें यही पूरा जवाब मिलेगा।"
          required
          rows={4}
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={setMessage}
          onBlur={() => setTouched(true)}
          error={fieldError}
          disabled={pending}
        />

        {/* ── step 3: the sentence they will actually receive ─────────── *
         * Not decoration. This single line is what stops "done" and "fixed"
         * from reaching somebody as the entire answer to their problem.     */}
        {/* The ERP's left-rule callout: a 3px neutral rule says "this block is
            different in kind" without spending a status hue on it. */}
        <div className="flex flex-col gap-1 rounded-field border-l-[3px] border-l-border-strong bg-surface-2 px-3 py-2.5">
          <span className={cn("deva text-text-3", T.caption)}>
            <Bi
              en={`${employeeName} will see:`}
              hi={`${employeeName} को यह दिखेगा:`}
            />
          </span>
          <p className={cn("deva text-text-1", T.bodySm)}>
            {trimmed === "" ? (
              <span className="text-text-3">
                <Bi en="Nothing yet." hi="अभी कुछ नहीं।" />
              </span>
            ) : (
              preview(trimmed)
            )}
          </p>
        </div>
      </HsModal>

      {/*
        The unsaved-changes confirm, rendered ALONGSIDE the dialog rather than
        inside it. A confirm nested in the dialog it is asking you to close
        disappears with its parent the moment the exit animation starts, which
        is a confirmation nobody ever sees.
      */}
      <HsModal
        open={confirmingDiscard}
        onOpenChange={(next) => {
          if (!next) setConfirmingDiscard(false);
        }}
        titleEn="Discard what you wrote?"
        titleHi="जो लिखा है वह छोड़ दें?"
        descriptionEn="The resolution message will be lost. The concern stays open either way."
        descriptionHi="लिखा हुआ संदेश चला जाएगा। शिकायत दोनों हालत में खुली रहेगी।"
        footer={
          // 44px below md (factory-floor touch target), ERP-compact 36px from
          // md up — see the note on the resolve footer above.
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => setConfirmingDiscard(false)}
            >
              <Bi en="Keep writing" hi="लिखते रहें" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 md:h-9"
              onClick={() => {
                setConfirmingDiscard(false);
                onOpenChange(false);
              }}
            >
              <Bi en="Discard" hi="छोड़ दें" />
            </Button>
          </>
        }
      />
    </>
  );
}

/** "Accepted: <their words>" — editable from the moment it lands. */
function prefill(solutions: ConcernSolutionRow[], id: string): string {
  const found = solutions.find((s) => s.id === id);
  if (!found) return "";
  return `Accepted: ${found.body}`;
}

/** Exactly what `notify_on_resolve` will store: the first 160 characters. */
function preview(message: string): string {
  if (message.length <= NOTIFICATION_CHARS) return message;
  return `${message.slice(0, NOTIFICATION_CHARS)}…`;
}
