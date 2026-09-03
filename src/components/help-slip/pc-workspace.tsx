"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBolt,
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconCircleCheck,
  IconDots,
  IconInfoCircle,
  IconLock,
  IconMessagePlus,
  IconPlayerPause,
  IconPlayerPlay,
  IconRotate,
  IconSearch,
  IconTimeline,
  IconUserPlus,
} from "@tabler/icons-react";

import {
  OverdueBadge,
  PriorityChip,
  StatusBadge,
} from "@/components/help-slip/badges";
import {
  ConcernNumber,
  ConfidentialMark,
  HsModal,
  MetaRow,
  ModalCancel,
  SlaLabel,
  SolutionList,
} from "@/components/help-slip/concern-parts";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
} from "@/components/help-slip/form-parts";
import {
  CountChip,
  PageHeader,
  Panel,
  SectionCard,
} from "@/components/help-slip/page-parts";
import { ResolveDialog } from "@/components/help-slip/resolve-dialog";
import { Timeline } from "@/components/help-slip/timeline";
import { T } from "@/components/help-slip/type-scale";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  PRIORITIES,
  WAIT_REASONS,
  type ConcernStatus,
  type WaitReason,
} from "@/db/help-slip/schema";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { useHelpSlipSession } from "@/lib/help-slip/context";
import { absoluteTime, departmentOf } from "@/lib/help-slip/format";
import {
  PRIORITY_META,
  TIMELINE_COPY,
  WAIT_REASON_META,
} from "@/lib/help-slip/meta";
import {
  blockedReason,
  canTransition,
  type BlockedReason,
  type MachineContext,
} from "@/lib/help-slip/state-machine";
import { useKeyboardInset } from "@/lib/help-slip/use-keyboard-inset";
import { HELP_SLIP_STALE_TIME } from "@/lib/help-slip/use-unread-count";
import {
  MESSAGE_MAX,
  NOTE_MAX,
  type ConcernDetailPayload,
} from "@/lib/help-slip/types";
import type { ConcernAction } from "@/lib/help-slip/validation";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The coordinator's workspace. One concern, and everything they can do to it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's
 * `src/features/concerns/screens/PcConcernWorkspace.tsx`.
 *
 * Two columns from 1024: the thread on the left, the facts and the action
 * stack on the right. Below that, one column, with the rail folded into a
 * collapsed "Details" summary under the title and the actions pinned to the
 * bottom — because a coordinator checking something at night on a phone needs
 * the state and the next action, not a scroll through the whole history to
 * find a button.
 *
 * ── EVERY CONTROL IS DRIVEN BY state-machine.ts ───────────────────────────
 *
 * There is no hand-written status list in this file. `canTransition()` decides
 * whether a move is offered, and when it is not, `blockedReason()` supplies
 * the SENTENCE the disabled control carries — so a grey button always says
 * what would make it available. An error that arrives after a click is a worse
 * explanation than a control that was never enabled, and the machine is
 * imported by `mutations.ts` too, so the button and the route cannot disagree
 * about what is legal.
 *
 * Three controls are not transitions at all — Assign, Change priority, Add
 * update. They are unavailable for exactly one reason (the concern is closed),
 * and even that sentence is read OFF the machine rather than written here:
 * see `CLOSED_REASON`.
 *
 * ── NOT OPTIMISTIC, DELIBERATELY ──────────────────────────────────────────
 *
 * The source is explicit about this and the reasoning survives the port: the
 * queue is a scan, where a wrong optimistic row is corrected on the next
 * refetch and costs nothing. THIS screen is where somebody decides a thing —
 * puts a concern on hold, hands it to a colleague, resolves it and fires a
 * notification the employee may already have read. An action that appears to
 * have worked and then silently reverts is worse than one that takes 400ms.
 *
 * The port is actually cheaper than the source here: `POST` answers with the
 * freshly re-read page, so every action is one round trip and the cache is
 * REPLACED with the truth rather than invalidated and re-fetched.
 *
 * ── PHOTOS ────────────────────────────────────────────────────────────────
 *
 * The source's attachment strip needs Supabase Storage to sign URLs; this
 * shell has no storage client, so there is no strip. See the note in
 * `raise-concern.tsx` for what to port when there is one.
 */

/**
 * The machine's own sentence for "this is over".
 *
 * Read OFF `blockedReason` rather than written out, so the words a closed
 * concern refuses with live in exactly one file — the same file the status
 * moves are refused from. From `closed` every target is illegal, so the `to`
 * is arbitrary.
 */
const CLOSED_REASON: BlockedReason | null = blockedReason(
  "closed",
  "in_progress",
);

/** Part 7.7 step 5: the resolve is undoable for ten seconds. */
const UNDO_WINDOW_MS = 10_000;

/** The note `unresolve_concern` records when the Undo is what fired it. */
const UNDO_NOTE = "Resolve undone by the coordinator.";

type DialogName =
  "hold" | "reopen" | "priority" | "assign" | "close" | "resolve" | null;

export function PcWorkspace({ id }: { id: string }) {
  const session = useHelpSlipSession();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  /** Where a notification's deep link lands, if it named a timeline row. */
  const targetId = params.get("u");

  const queryKey = React.useMemo(() => ["help-slip", "concern", id], [id]);

  const q = useQuery({
    queryKey,
    queryFn: () =>
      helpSlipGet<ConcernDetailPayload | null>(`/api/help-slip/concerns/${id}`),
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const [dialog, setDialog] = React.useState<DialogName>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<React.ReactNode>(null);
  const [undoUntil, setUndoUntil] = React.useState(0);

  const [draft, setDraft] = React.useState("");
  const [isInternal, setIsInternal] = React.useState(false);
  const [timelineView, setTimelineView] = React.useState<"public" | "internal">(
    "public",
  );

  /** The coordinator's local pick, carried into the resolve dialog. */
  const [picked, setPicked] = React.useState<string | null>(null);

  const [holdReason, setHoldReason] =
    React.useState<WaitReason>("awaiting_vendor");
  const [holdNote, setHoldNote] = React.useState("");
  const [reopenNote, setReopenNote] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  /**
   * The composer, so the rail's "Add update" can put the cursor in it.
   *
   * On a 1440px screen the action stack and the composer are metres apart; an
   * action called "Add update" that merely scrolled would still leave the
   * coordinator hunting for the box.
   */
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  /** Non-zero only while a software keyboard covers the layout viewport. */
  const keyboardInset = useKeyboardInset();

  const payload = q.data ?? null;

  // ── every write on this screen, as one mutation ────────────────────────
  const act = useMutation({
    mutationFn: (action: ConcernAction) =>
      helpSlipSend<ConcernDetailPayload | null>(
        `/api/help-slip/concerns/${id}`,
        "POST",
        action,
      ),
    onSuccess: (fresh) => {
      // The response IS the re-read page. Replace, never guess.
      queryClient.setQueryData(queryKey, fresh);
      // The queue's counts and rows both move when a status does.
      void queryClient.invalidateQueries({ queryKey: ["help-slip", "queue"] });
      void queryClient.invalidateQueries({
        queryKey: ["help-slip", "all-concerns"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["help-slip", "dashboard"],
      });
    },
  });

  const busy = act.isPending;

  /** Run an action, close whatever prompt asked for it, and say so. */
  const run = React.useCallback(
    (
      action: ConcernAction,
      options?: { onDone?: () => void; notice?: React.ReactNode },
    ) => {
      setActionError(null);
      act.mutate(action, {
        onSuccess: () => {
          setDialog(null);
          setNotice(options?.notice ?? "Saved.");
          options?.onDone?.();
        },
        onError: (e) => setActionError((e as Error).message),
      });
    },
    [act],
  );

  // The one-line notice this shell uses in place of a toast. It clears itself,
  // and the Undo window closes with it — an affordance that lingers after it
  // stops working is worse than none.
  React.useEffect(() => {
    if (!notice) return;
    const ms = undoUntil > Date.now() ? undoUntil - Date.now() : 4000;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setUndoUntil(0);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [notice, undoUntil]);

  // ── the four states ────────────────────────────────────────────────────

  if (q.isPending) return <WorkspaceSkeleton />;

  if (q.isError) {
    return (
      <Shell>
        <Panel>
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <EmptyState
              icon={IconSearch}
              title="We couldn't load this."
              description={(q.error as Error).message}
            />
            <Button
              type="button"
              variant="outline"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              onClick={() => void q.refetch()}
            >
              Try again
            </Button>
          </div>
        </Panel>
      </Shell>
    );
  }

  if (!payload) {
    // The same words a bad id gets. RLS answers "not yours" with zero rows and
    // this screen must not be the place that tells them apart.
    return (
      <Shell>
        <Panel>
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <EmptyState
              icon={IconSearch}
              title="Not found"
              description="This concern does not exist, or it is not yours to open."
            />
            <Button
              type="button"
              variant="outline"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              onClick={() => router.push("/help-slip/all")}
            >
              All concerns
            </Button>
          </div>
        </Panel>
      </Shell>
    );
  }

  const { concern, solutions, updates, assignees } = payload;
  const status: ConcernStatus = concern.status;
  const context: MachineContext = { resolvedAt: concern.resolvedAt };
  const isClosed = status === "closed";
  /** Drives the mount-stagger indices — the resolution card is conditional. */
  const hasResolution = Boolean(concern.resolutionMessage);

  /** Legal, or the machine's reason it is not. One call site, one table. */
  const gate = (to: ConcernStatus) => ({
    ok: canTransition(status, to, context),
    why: blockedReason(status, to, context),
  });

  const resolveGate = gate("resolved");
  const holdGate = gate("waiting");
  const closeGate = gate("closed");
  // `in_progress` is the target of THREE different moves — start, resume and
  // reopen — so which control owns it is decided by where we are, not by the
  // machine. Everything about whether it is legal still comes from the machine.
  const progressGate = gate("in_progress");

  const visibleUpdates = updates.filter((u) =>
    timelineView === "internal" ? u.isInternal : !u.isInternal,
  );

  const post = () => {
    const body = draft.trim();
    if (!body || busy) return;
    const wasInternal = isInternal;
    setDraft("");
    act.mutate(
      { action: "comment", message: body, isInternal: wasInternal },
      {
        onSuccess: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
          // Show the note where it actually landed, or the coordinator posts an
          // internal note and appears to have posted nothing.
          if (wasInternal) setTimelineView("internal");
          setNotice("Saved.");
        },
        onError: (e) => {
          setDraft(body);
          setActionError((e as Error).message);
        },
      },
    );
  };

  const focusComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
    el.focus({ preventScroll: true });
  };

  /**
   * Resolve, then offer Undo for ten seconds.
   *
   * The Undo is a real server call (the `reopen` action, which is
   * `unresolve_concern`), not a client-side rollback: the resolve has already
   * written a notification and a timeline row, and neither of those can be
   * un-rendered by forgetting about them.
   */
  const runResolve = (input: {
    resolution: string;
    acceptedSolutionId: string | null;
  }) => {
    setActionError(null);
    act.mutate(
      { action: "resolve", ...input },
      {
        onSuccess: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
          setDialog(null);
          setPicked(null);
          setUndoUntil(Date.now() + UNDO_WINDOW_MS);
          setNotice("Concern resolved.");
        },
        onError: (e) => setActionError((e as Error).message),
      },
    );
  };

  // ── the action stack, at two densities ─────────────────────────────────
  // `dense` drives the desktop rail, where a mouse is doing the clicking. The
  // mobile sheet always renders dense={false}: that is the one place the 44px
  // touch target still matters, and it keeps it.
  const actionStack = (dense: boolean) => (
    <div className={cn("flex flex-col", dense ? "gap-1.5" : "gap-2")}>
      {/* Resolve is the primary, and the only one. It takes the SAME two
          sizes as everything else in the stack, off the existing `dense`
          flag: 44px in the phone sheet — the minimum touch target for a
          phone held on the factory floor — and the ERP's 36px in the rail,
          where a mouse is doing the clicking. */}
      <div>
        <Button
          type="button"
          size="lg"
          className={cn("w-full", dense ? "h-9" : "h-11 text-base")}
          disabled={!resolveGate.ok || busy}
          onClick={() => {
            setActionError(null);
            setDialog("resolve");
          }}
        >
          <IconCheck
            className={dense ? "size-4" : "size-5"}
            stroke={1.8}
            aria-hidden
          />
          Resolve
        </Button>
        <Why reason={resolveGate.ok ? null : resolveGate.why} />
      </div>

      {/* Start / Resume / Reopen all target `in_progress`. Exactly one of them
          is the right verb for where the concern is, so exactly one renders —
          and each is gated by the machine's answer for that same target. */}
      {status === "waiting" ? (
        <ActionButton
          label="Resume work"
          icon={
            <IconPlayerPlay
              className={dense ? "size-4" : "size-5"}
              stroke={1.6}
              aria-hidden
            />
          }
          dense={dense}
          disabled={busy || !progressGate.ok}
          reason={progressGate.ok ? null : progressGate.why}
          onClick={() => run({ action: "resume" })}
        />
      ) : status === "resolved" || status === "closed" ? (
        <ActionButton
          label="Reopen"
          icon={
            <IconRotate
              className={dense ? "size-4" : "size-5"}
              stroke={1.6}
              aria-hidden
            />
          }
          dense={dense}
          disabled={busy || !progressGate.ok}
          reason={progressGate.ok ? null : progressGate.why}
          onClick={() => {
            setActionError(null);
            setReopenNote("");
            setDialog("reopen");
          }}
        />
      ) : (
        <ActionButton
          label="Start work"
          icon={
            <IconPlayerPlay
              className={dense ? "size-4" : "size-5"}
              stroke={1.6}
              aria-hidden
            />
          }
          dense={dense}
          disabled={busy || !progressGate.ok}
          reason={progressGate.ok ? null : progressGate.why}
          // Start CLAIMS it: the route assigns it to the caller if nobody holds
          // it, in the same transaction. Making a coordinator say so twice
          // invites a queue of in-progress concerns owned by nobody.
          onClick={() => run({ action: "start" })}
        />
      )}

      <ActionButton
        label="Add update"
        icon={
          <IconMessagePlus
            className={dense ? "size-4" : "size-5"}
            stroke={1.6}
            aria-hidden
          />
        }
        dense={dense}
        disabled={isClosed}
        reason={isClosed ? CLOSED_REASON : null}
        onClick={focusComposer}
      />

      <ActionButton
        label="Put on hold"
        icon={
          <IconPlayerPause
            className={dense ? "size-4" : "size-5"}
            stroke={1.6}
            aria-hidden
          />
        }
        dense={dense}
        disabled={busy || !holdGate.ok}
        reason={holdGate.ok ? null : holdGate.why}
        onClick={() => {
          setActionError(null);
          setDialog("hold");
        }}
      />

      <ActionButton
        label="Change priority"
        dense={dense}
        disabled={busy || isClosed}
        reason={isClosed ? CLOSED_REASON : null}
        onClick={() => {
          setActionError(null);
          setDialog("priority");
        }}
      />

      {/* LAST, and named for what it actually does. Start work already claims
          the concern, so this is the rarer action: giving it to SOMEBODY ELSE
          (or to nobody). */}
      <ActionButton
        label="Assign"
        icon={
          <IconUserPlus
            className={dense ? "size-4" : "size-5"}
            stroke={1.6}
            aria-hidden
          />
        }
        dense={dense}
        disabled={busy || isClosed}
        reason={isClosed ? CLOSED_REASON : null}
        onClick={() => {
          setActionError(null);
          setDialog("assign");
        }}
      />

      {/* Separated by whitespace AND a rule: closing is the end of the line. */}
      <div
        className={cn(
          "border-t border-border",
          dense ? "mt-2 pt-2" : "mt-4 pt-4",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          // 44px in the phone sheet, the ERP's 36px in the rail — the same
          // split as every other control in this stack.
          className={cn("w-full", dense ? "h-9" : "h-11")}
          disabled={busy || !closeGate.ok}
          onClick={() => {
            setActionError(null);
            setDialog("close");
          }}
        >
          Close concern
        </Button>
        <p className={cn("mt-1 text-text-3", T.caption)}>
          {closeGate.ok
            ? "The employee can no longer comment on it. Nothing is deleted."
            : (closeGate.why?.en ?? null)}
        </p>
      </div>
    </div>
  );

  const employeeName = concern.employeeName ?? "The employee";

  return (
    <Shell>
      <Reveal index={0} className="flex flex-col gap-2">
        <Link
          href="/help-slip/all"
          className={cn(
            // 44px tap row below md — the minimum touch target for a phone
            // held on the factory floor. The ERP's own back link (12.5px,
            // gap-1.5) from md up.
            "-ml-1 inline-flex min-h-11 items-center gap-1.5 self-start text-text-3 transition-colors hover:text-text-1 md:min-h-0",
            T.bodySm,
          )}
        >
          <IconChevronLeft
            className="size-4 md:size-3.5"
            stroke={1.6}
            aria-hidden
          />
          All concerns
        </Link>

        <PageHeader
          titleEn={concern.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ConcernNumber value={concern.concernNumber} />
              <span>
                {employeeName}
                {" · "}
                {/* The department's English name only. The Hindi column stays
                    in the database for the legacy app; nothing here reads it. */}
                {departmentOf(concern)}
              </span>
              {concern.visibility === "hr_only" ? <ConfidentialMark /> : null}
            </span>
          }
        />
      </Reveal>

      {/* The one-line notice this shell uses in place of a toast, carrying the
          ten-second Undo when a resolve put one there. */}
      {notice ? (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-field border border-border bg-surface-2 px-3 py-2 text-text-2",
            T.bodySm,
          )}
        >
          <span>{notice}</span>
          {undoUntil > Date.now() ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              // A size="sm" Button is 28px tall. 44px below md is the minimum
              // touch target for a phone held on the factory floor; the ERP's
              // own compact button from md up.
              className="h-11 md:h-8"
              disabled={busy}
              onClick={() => {
                setUndoUntil(0);
                setNotice(null);
                run(
                  { action: "reopen", note: UNDO_NOTE },
                  { notice: "Resolve undone." },
                );
              }}
            >
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-status-red",
            T.bodySm,
          )}
        >
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 pb-6 lg:pb-4">
        {/* ── phone: the rail, folded ─────────────────────────────────── */}
        <Panel className="lg:hidden">
          <details className="group">
            {/* The ERP panel-head strip, as a `summary`: the chip and the
                heading say what the card is, the badges ARE the state, and the
                whole 44px row is the disclosure. */}
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1.5 bg-surface-2/40 px-4 py-3 sm:px-5">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-text [&_svg]:size-[15px]"
              >
                <IconInfoCircle stroke={1.6} />
              </span>
              <span className={cn("text-text-1", T.h2)}>Details</span>
              <StatusBadge status={status} />
              <PriorityChip priority={concern.priority} />
              <SlaLabel slaDueAt={concern.slaDueAt} status={status} />
              <IconChevronDown
                className="ml-auto size-4 shrink-0 text-text-3 transition-transform group-open:rotate-180"
                stroke={1.6}
                aria-hidden
              />
            </summary>
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <Facts payload={payload} />
            </div>
          </details>
        </Panel>

        {/* pb-20 clears the pinned mobile action bar; the rail replaces it
            from 1024, so it drops there. */}
        <div className="flex flex-col gap-4 pb-20 lg:flex-row lg:items-start lg:pb-0">
          {/* ═══ the main column ══════════════════════════════════════ */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* ── the employee's solutions, as selectable cards ─────── */}
            <Reveal index={1}>
              {/* The id stays on the text itself, because `SolutionList`'s
                  radiogroup is labelled by it. */}
              <SectionCard
                title={
                  <span id="ws-solutions">
                    Employee&apos;s suggested solutions
                  </span>
                }
                icon={<IconBulb stroke={1.6} />}
                aside={<CountChip>{solutions.length}</CountChip>}
              >
                {/*
                  Selection is LOCAL until the resolve commits it. The two
                  states are drawn differently on purpose — brand for "I have
                  picked this", green for "this one was accepted" — and they
                  can be true at once without reading as the same fact.
                */}
                <SolutionList
                  solutions={solutions}
                  acceptedId={concern.acceptedSolutionId}
                  pickedId={picked}
                  onPick={setPicked}
                  disabled={isClosed || busy}
                  labelledBy="ws-solutions"
                />
              </SectionCard>
            </Reveal>

            {/* ── resolution, when there is one ─────────────────────── */}
            {/* The indices below are computed, not literal: this card is
                conditional, and a fixed 2 here would leave the sequence
                1,3,4 — a 110ms hole in the stagger — on every concern that
                is not yet resolved, which is the screen's usual state. */}
            {hasResolution ? (
              <Reveal index={2}>
                <SectionCard
                  title="How it was resolved"
                  icon={<IconCircleCheck stroke={1.6} />}
                >
                  {/* The ERP's left-rule callout, "ok" tone: a 3px rule says
                      this block is different in kind. */}
                  <div className="rounded-field border-l-[3px] border-l-status-green bg-status-green-dim px-3 py-2.5">
                    <p className={cn("whitespace-pre-line text-text-1", T.body)}>
                      {concern.resolutionMessage}
                    </p>
                  </div>
                </SectionCard>
              </Reveal>
            ) : null}

            {/* ── the timeline, with the visibility toggle ──────────── */}
            <Reveal index={hasResolution ? 3 : 2}>
              <SectionCard
                title={<span id="ws-activity">Activity</span>}
                icon={<IconTimeline stroke={1.6} />}
                aside={
                  <Segmented<"public" | "internal">
                    value={timelineView}
                    onChange={setTimelineView}
                    label="Which updates"
                    options={[
                      { value: "public", label: "Public" },
                      { value: "internal", label: "Internal" },
                    ]}
                    // The `md` segment is 32px. Below `md` the segments are
                    // 44px — the minimum touch target for a phone held on the
                    // factory floor — and the ERP's own geometry above it.
                    className="[&_button]:h-11 md:[&_button]:h-8"
                  />
                }
              >
                <Timeline
                  events={visibleUpdates}
                  // Staff, so internal notes render with their amber-ruled
                  // treatment. The toggle above decides WHICH set is on
                  // screen; this decides whether internal ones may be drawn at
                  // all — and this screen is staff-gated on the server.
                  canSeeInternal
                  targetId={targetId}
                />
              </SectionCard>
            </Reveal>

            {/* ── the composer ─────────────────────────────────────── *
             * ══ INTERNAL NOTE vs PUBLIC REPLY ═══════════════════════
             * The single most important distinction on this screen, and it is
             * carried FOUR ways at once, none of them colour alone:
             *
             *   1. a different GROUND — the whole composer switches to the
             *      chip fill behind a solid 3px amber left rule, which is
             *      exactly how an internal row is drawn in the timeline below;
             *   2. an explicit LABEL — the same sentence the timeline prints
             *      on an internal row, read out of TIMELINE_COPY so the two
             *      cannot drift;
             *   3. a different HEADING — "Reply to the employee" against
             *      "Internal note";
             *   4. a different BUTTON — "Post reply" against "Post internal
             *      note", and secondary rather than primary.
             *
             * Getting this wrong is the worst outcome on this screen: an
             * internal note posted as a public reply is a disclosure, and a
             * public reply posted as an internal note is an employee waiting
             * for an answer that will never arrive.                        */}
            <Reveal index={hasResolution ? 4 : 3}>
              <SectionCard
                title={
                  <span id="ws-compose">
                    {isInternal ? "Internal note" : "Reply to the employee"}
                  </span>
                }
                // Signal 3 and part of signal 1: the head chip changes glyph
                // with the mode, so the card announces which kind it is before
                // a word of it is read.
                icon={
                  isInternal ? (
                    <IconLock stroke={1.6} />
                  ) : (
                    <IconMessagePlus stroke={1.6} />
                  )
                }
                className={cn(
                  "transition-colors",
                  // Signal 1 of 4, and it is the same treatment the timeline
                  // gives an internal row: the ERP's SOLID 3px "different in
                  // kind" left rule in amber, over the chip ground. No status
                  // hue beyond it — every other one is already spoken for on
                  // the rail below.
                  isInternal && "border-l-[3px] border-l-status-amber bg-chip",
                )}
              >
                {/* Signal 2: the sentence the timeline prints on an internal
                    row, read out of TIMELINE_COPY so the two cannot drift. It
                    is the ERP notice strip (E.8) rather than a caption — the
                    one line on this screen that must not be skimmed past. */}
                {isInternal ? (
                  <p
                    className={cn(
                      "flex items-start gap-2 rounded-field border border-status-amber/30 bg-status-amber-dim px-3 py-2 font-semibold text-status-amber",
                      T.bodySm,
                    )}
                  >
                    <IconLock
                      className="mt-[1px] size-4 shrink-0"
                      stroke={1.6}
                      aria-hidden
                    />
                    {TIMELINE_COPY.internalNote.en}
                  </p>
                ) : (
                  <p className={cn("text-text-3", T.bodySm)}>
                    This appears on the employee&apos;s own page.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <TextAreaField
                    id="ws-compose-box"
                    labelEn="Add an update"
                    // The heading above already says which kind this is. A
                    // visible label repeating it is one more line to read and
                    // nothing to learn — so it stays as the ACCESSIBLE name
                    // only, which a screen reader still needs because a
                    // heading is not programmatically a field's label.
                    labelHidden
                    placeholder="What has happened?"
                    value={draft}
                    onChange={setDraft}
                    rows={3}
                    maxLength={MESSAGE_MAX}
                    disabled={isClosed || busy}
                    textareaRef={composerRef}
                  />

                  <CheckboxField
                    id="ws-internal"
                    checked={isInternal}
                    onChange={setIsInternal}
                    labelEn="Internal note (employee won't see)"
                    descriptionEn="Only coordinators can read it. It never appears in their timeline."
                    disabled={isClosed || busy}
                  />

                  <Button
                    type="button"
                    variant={isInternal ? "secondary" : "default"}
                    size="lg"
                    onClick={post}
                    disabled={isClosed || busy || draft.trim().length === 0}
                    // 44px + 16px text below md: the minimum touch target for
                    // a phone held on the factory floor, and anything under
                    // 16px makes iOS Safari auto-zoom on focus and never zoom
                    // back out. ERP-compact (36px / 13px) from md up.
                    className="h-11 w-full px-5 text-base md:h-9 md:w-auto md:self-start md:px-3 md:text-sm"
                  >
                    {busy ? <Spinner /> : null}
                    {isInternal ? "Post internal note" : "Post reply"}
                  </Button>
                </div>
              </SectionCard>
            </Reveal>
          </div>

          {/* ═══ the rail, 1024+ ══════════════════════════════════════ */}
          <aside className="hidden w-80 shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:flex">
            <SectionCard title="Details" icon={<IconInfoCircle stroke={1.6} />}>
              <Facts payload={payload} withStatus />
            </SectionCard>
            <SectionCard title="Actions" icon={<IconBolt stroke={1.6} />}>
              {actionStack(true)}
            </SectionCard>
          </aside>
        </div>
      </div>

      {/* ── the pinned mobile action bar ────────────────────────────────
       * HIDDEN while the keyboard is up, rather than translated above it.
       *
       * `StickySubmitBar` on the raise form rides UP on the same measurement,
       * and must: there the bar IS the submit. Here the opposite is true — the
       * only reason the keyboard is open on this screen is that somebody is
       * typing in the composer, and the composer has its own Post button in
       * the flow. A Resolve bar riding up would park itself on top of it. Same
       * rule, opposite response, because this bar is not what the thumb is
       * reaching for. */}
      <div
        className={cn(
          // `md:left-[264px]` clears the shell's sidebar, which appears at 768
          // and is a fixed 264px (src/components/shell/sidebar.tsx). The source
          // app had no sidebar and could use inset-x-0 throughout; here a
          // full-bleed fixed bar would lie across the navigation between 768
          // and 1023, which is exactly the band where the rail has not yet
          // taken over.
          "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-[6px] md:left-[264px] lg:hidden",
          keyboardInset > 0 && "hidden",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Button
              type="button"
              size="lg"
              className="h-11 w-full text-base"
              disabled={!resolveGate.ok || busy}
              onClick={() => {
                setActionError(null);
                setDialog("resolve");
              }}
            >
              <IconCheck className="size-5" stroke={1.8} aria-hidden />
              Resolve
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More actions"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-field border border-border bg-surface text-text-2 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <IconDots className="size-5" stroke={1.6} aria-hidden />
          </button>
        </div>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          // 85dvh, not 85vh: on a phone `vh` is measured against the browser
          // chrome expanded, so a sheet sized in `vh` runs under the address bar.
          className="max-h-[85dvh] overflow-y-auto rounded-t-card"
        >
          <SheetHeader>
            <SheetTitle className={T.h3}>Actions</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4" onClick={() => setMoreOpen(false)}>
            {actionStack(false)}
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══ the prompts ══════════════════════════════════════════════ */}

      <ResolveDialog
        open={dialog === "resolve"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        employeeName={employeeName}
        solutions={solutions}
        // Whatever they picked in the solutions panel carries into the dialog.
        // Making them choose the same solution twice is the kind of small
        // insult that stops a flow being used.
        initialSolutionId={picked}
        onResolve={runResolve}
        pending={busy}
        error={actionError}
      />

      <HsModal
        open={dialog === "hold"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        titleEn="Put on hold"
        descriptionEn="Say what it is waiting for. The employee sees this note."
        error={actionError}
        footer={
          <>
            <ModalCancel disabled={busy} />
            <Button
              type="button"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              disabled={busy || holdNote.trim().length === 0}
              onClick={() =>
                run(
                  { action: "hold", reason: holdReason, note: holdNote.trim() },
                  { onDone: () => setHoldNote("") },
                )
              }
            >
              {busy ? <Spinner /> : null}
              Put on hold
            </Button>
          </>
        }
      >
        <SelectField
          id="ws-hold-reason"
          labelEn="Waiting for"
          value={holdReason}
          onChange={(v) => setHoldReason(v as WaitReason)}
          // Never the raw enum: `awaiting_vendor` is a storage value and
          // "A vendor" is the answer to the question this asks.
          options={WAIT_REASONS.map((r) => ({
            value: r,
            label: WAIT_REASON_META[r].labelEn,
          }))}
          disabled={busy}
        />
        <TextAreaField
          id="ws-hold-note"
          labelEn="Note"
          // The helper sits on the LABEL ROW now, right-aligned, so it has to
          // fit there: a clause, not a sentence.
          helperEn="A hold with no reason reads as being ignored."
          required
          rows={3}
          maxLength={NOTE_MAX}
          value={holdNote}
          onChange={setHoldNote}
          disabled={busy}
        />
      </HsModal>

      <HsModal
        open={dialog === "reopen"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        titleEn="Reopen this concern"
        descriptionEn="It goes back to in progress and the employee is told why."
        error={actionError}
        footer={
          <>
            <ModalCancel disabled={busy} />
            <Button
              type="button"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              disabled={busy || reopenNote.trim().length === 0}
              onClick={() =>
                run(
                  { action: "reopen", note: reopenNote.trim() },
                  { onDone: () => setReopenNote("") },
                )
              }
            >
              {busy ? <Spinner /> : null}
              Reopen
            </Button>
          </>
        }
      >
        <TextAreaField
          id="ws-reopen-note"
          labelEn="Why is it being reopened?"
          // On the label row, right-aligned: a clause, not a sentence.
          helperEn="The employee reads this as the reason."
          required
          rows={3}
          maxLength={NOTE_MAX}
          value={reopenNote}
          onChange={setReopenNote}
          disabled={busy}
        />
      </HsModal>

      <HsModal
        open={dialog === "priority"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        titleEn="Change priority"
        error={actionError}
        footer={<ModalCancel disabled={busy} />}
      >
        {/* Four short answers, so they read across rather than down.
            Single column below `sm`: two 44px rows side by side at 360px is
            two rows nobody can hit. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRIORITIES.map((p) => (
            <ChoiceRow
              key={p}
              label={PRIORITY_META[p].labelEn}
              selected={p === concern.priority}
              disabled={busy}
              onClick={() => run({ action: "priority", priority: p })}
            />
          ))}
        </div>
      </HsModal>

      <HsModal
        open={dialog === "assign"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        titleEn="Assign this concern"
        descriptionEn="Active coordinators and admins only."
        error={actionError}
        footer={<ModalCancel disabled={busy} />}
      >
        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {/*
            "To me", first, when we can find "me" in the list.

            The client is never given its own profile id — see the note on
            `HelpSlipClientSession` — so the only handle available is the name
            the server already sent in `assignees`. Matching on it is good
            enough for a convenience row and is not a boundary of any kind:
            if two coordinators share a name, or the match fails, this row
            simply does not appear and their own name is still in the list
            below. The write is authorised by RLS either way.
          */}
          {(() => {
            const me = assignees.find((a) => a.name === session.fullName);
            if (!me) return null;
            return (
              <ChoiceRow
                label="Assign to me"
                selected={concern.assignedTo === me.id}
                disabled={busy}
                onClick={() => run({ action: "assign", assigneeId: me.id })}
              />
            );
          })()}

          <ChoiceRow
            label="Nobody"
            selected={concern.assignedTo === null}
            disabled={busy}
            onClick={() => run({ action: "assign", assigneeId: null })}
          />

          {assignees.map((a) => (
            <ChoiceRow
              key={a.id}
              label={a.name}
              selected={concern.assignedTo === a.id}
              disabled={busy}
              onClick={() => run({ action: "assign", assigneeId: a.id })}
            />
          ))}
        </div>
      </HsModal>

      <HsModal
        open={dialog === "close"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        titleEn="Close this concern?"
        descriptionEn="The employee can no longer comment on it. Nothing is deleted."
        error={actionError}
        footer={
          <>
            <ModalCancel disabled={busy} />
            <Button
              type="button"
              variant="destructive"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              disabled={busy}
              onClick={() => run({ action: "close" })}
            >
              {busy ? <Spinner /> : null}
              Confirm
            </Button>
          </>
        }
      />
    </Shell>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * The measure. MODULE LEVEL — a component declared during render is a new
 * component type every render, which unmounts the subtree on every keystroke
 * and costs the composer its focus after one character.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      {children}
    </div>
  );
}

/**
 * One action, and the reason it is unavailable when it is.
 *
 * The reason travels WITH the control — as a `title` for hover and long-press,
 * and as a line underneath, because a tooltip nobody hovers is not an
 * explanation. It never invents a sentence: `reason` always comes from
 * `blockedReason()`.
 */
function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  reason,
  dense,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  reason: BlockedReason | null;
  /** Desktop rail only. The mobile sheet always leaves this false. */
  dense?: boolean;
}) {
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={disabled}
        title={reason?.en}
        className={cn("w-full", dense ? "h-9" : "h-11 text-base")}
      >
        {icon}
        {label}
      </Button>
      {reason ? (
        <p className={cn("mt-1 text-text-3", T.caption)}>{reason.en}</p>
      ) : null}
    </div>
  );
}

/** The line under a disabled primary, for the same reason as above. */
function Why({ reason }: { reason: BlockedReason | null }) {
  if (!reason) return null;
  return <p className={cn("mt-1 text-text-3", T.caption)}>{reason.en}</p>;
}

/** A pickable row in the priority and assign prompts. */
function ChoiceRow({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        // 44px tap row below md — the minimum touch target for a phone held
        // on the factory floor; ERP density from md up.
        "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-field border px-3 py-2 text-left transition-colors outline-none md:min-h-9",
        "focus-visible:ring-3 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-accent"
          : "border-border hover:bg-surface-2",
      )}
    >
      <span className={cn("text-text-1", T.body)}>{label}</span>
      {selected ? (
        <IconCheck
          className="size-4 shrink-0 text-accent-text"
          stroke={2}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

/**
 * The facts. Rendered twice — the phone's fold and the 1024+ rail — from one
 * definition, so the two cannot drift.
 */
function Facts({
  payload,
  withStatus = false,
}: {
  payload: ConcernDetailPayload;
  withStatus?: boolean;
}) {
  const { concern } = payload;
  const typed = concern.filedForName?.trim();
  const account = concern.employeeName ?? null;
  const differs = Boolean(typed && account && typed !== account);

  return (
    <dl className="flex flex-col">
      {withStatus ? (
        <>
          <MetaRow labelEn="Status">
            <span className="flex flex-wrap items-center gap-1">
              <StatusBadge status={concern.status} />
              {concern.isOverdue ? <OverdueBadge /> : null}
            </span>
          </MetaRow>
          <MetaRow labelEn="Priority">
            <PriorityChip priority={concern.priority} alwaysShow />
          </MetaRow>
        </>
      ) : null}

      <MetaRow labelEn="Assigned">
        <span className={cn(!concern.assignedToName && "text-text-3")}>
          {concern.assignedToName ?? "Nobody"}
        </span>
      </MetaRow>
      <MetaRow labelEn="Employee">
        <span className="block">{typed || account || "—"}</span>
        {differs ? (
          <span className={cn("mt-0.5 block text-text-3", T.caption)}>
            {`Filed from ${account ?? ""}`}
          </span>
        ) : null}
      </MetaRow>
      <MetaRow labelEn="Department">{departmentOf(concern)}</MetaRow>
      <MetaRow labelEn="Raised">
        <span className="num">{absoluteTime(concern.createdAt)}</span>
      </MetaRow>
      <MetaRow labelEn="SLA due">
        <SlaLabel slaDueAt={concern.slaDueAt} status={concern.status} />
      </MetaRow>
      {concern.waitReason ? (
        <MetaRow labelEn="Waiting for">
          {WAIT_REASON_META[concern.waitReason].labelEn}
        </MetaRow>
      ) : null}
      {concern.resolvedAt ? (
        <MetaRow labelEn="Resolved">
          <span className="num">{absoluteTime(concern.resolvedAt)}</span>
        </MetaRow>
      ) : null}
    </dl>
  );
}

/**
 * The same shape as the real screen, so nothing jumps when it arrives: a
 * 33px title line (22px x 1.5), the main column of cards, and the rail's two.
 */
function WorkspaceSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-[33px] w-3/5" />
      <div
        className="flex flex-col gap-4 lg:flex-row lg:items-start"
        aria-busy
        role="status"
      >
        <span className="sr-only">Loading concern</span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
        <div className="hidden w-80 shrink-0 flex-col gap-3 lg:flex">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      </div>
    </Shell>
  );
}
