"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconDots,
  IconLock,
  IconMessagePlus,
  IconPlayerPause,
  IconPlayerPlay,
  IconRotate,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";

import {
  OverdueBadge,
  PriorityChip,
  StatusBadge,
} from "@/components/help-slip/badges";
import { Bi } from "@/components/help-slip/bilingual";
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
import { PageHeader, Panel } from "@/components/help-slip/page-parts";
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
import { useHelpSlipLocale, useHelpSlipSession } from "@/lib/help-slip/context";
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
const CLOSED_REASON: BlockedReason | null = blockedReason("closed", "in_progress");

/** Part 7.7 step 5: the resolve is undoable for ten seconds. */
const UNDO_WINDOW_MS = 10_000;

/** The note `unresolve_concern` records when the Undo is what fired it. */
const UNDO_NOTE = "Resolve undone by the coordinator.";

type DialogName =
  | "hold"
  | "reopen"
  | "priority"
  | "assign"
  | "close"
  | "resolve"
  | null;

export function PcWorkspace({ id }: { id: string }) {
  const locale = useHelpSlipLocale();
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
  const [timelineView, setTimelineView] =
    React.useState<"public" | "internal">("public");

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
      void queryClient.invalidateQueries({ queryKey: ["help-slip", "dashboard"] });
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
          setNotice(options?.notice ?? <Bi en="Saved." hi="सेव हो गया।" />);
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
        <div className="flex flex-col items-center gap-3 py-10">
          <EmptyState
            icon={IconSearch}
            title={
              <Bi
                en="We couldn't load this."
                hi="यह लोड नहीं हो सका।"
              />
            }
            description={(q.error as Error).message}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void q.refetch()}
          >
            <Bi en="Try again" hi="दोबारा कोशिश करें" />
          </Button>
        </div>
      </Shell>
    );
  }

  if (!payload) {
    // The same words a bad id gets. RLS answers "not yours" with zero rows and
    // this screen must not be the place that tells them apart.
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-10">
          <EmptyState
            icon={IconSearch}
            title={<Bi en="Not found" hi="नहीं मिला" />}
            description={
              <Bi
                en="This concern does not exist, or it is not yours to open."
                hi="यह शिकायत मौजूद नहीं है, या यह आपकी नहीं है।"
              />
            }
          />
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => router.push("/help-slip/all")}
          >
            <Bi en="All concerns" hi="सभी शिकायतें" />
          </Button>
        </div>
      </Shell>
    );
  }

  const { concern, solutions, updates, assignees } = payload;
  const status: ConcernStatus = concern.status;
  const context: MachineContext = { resolvedAt: concern.resolvedAt };
  const isClosed = status === "closed";

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
          setNotice(<Bi en="Saved." hi="सेव हो गया।" />);
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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
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
          setNotice(<Bi en="Concern resolved." hi="शिकायत हल हो गई।" />);
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
      {/* Resolve is the primary, and the only one. It stays full-size at every
          density — the primary CTA is not where this screen saves space. */}
      <div>
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
          <Bi en="Resolve" hi="हल करें" />
        </Button>
        <Why reason={resolveGate.ok ? null : resolveGate.why} />
      </div>

      {/* Start / Resume / Reopen all target `in_progress`. Exactly one of them
          is the right verb for where the concern is, so exactly one renders —
          and each is gated by the machine's answer for that same target. */}
      {status === "waiting" ? (
        <ActionButton
          en="Resume work"
          hi="काम फिर शुरू करें"
          icon={<IconPlayerPlay className="size-5" stroke={1.6} aria-hidden />}
          dense={dense}
          disabled={busy || !progressGate.ok}
          reason={progressGate.ok ? null : progressGate.why}
          onClick={() => run({ action: "resume" })}
        />
      ) : status === "resolved" || status === "closed" ? (
        <ActionButton
          en="Reopen"
          hi="दोबारा खोलें"
          icon={<IconRotate className="size-5" stroke={1.6} aria-hidden />}
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
          en="Start work"
          hi="काम शुरू करें"
          icon={<IconPlayerPlay className="size-5" stroke={1.6} aria-hidden />}
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
        en="Add update"
        hi="अपडेट जोड़ें"
        icon={<IconMessagePlus className="size-5" stroke={1.6} aria-hidden />}
        dense={dense}
        disabled={isClosed}
        reason={isClosed ? CLOSED_REASON : null}
        onClick={focusComposer}
      />

      <ActionButton
        en="Put on hold"
        hi="रोक लगाएँ"
        icon={<IconPlayerPause className="size-5" stroke={1.6} aria-hidden />}
        dense={dense}
        disabled={busy || !holdGate.ok}
        reason={holdGate.ok ? null : holdGate.why}
        onClick={() => {
          setActionError(null);
          setDialog("hold");
        }}
      />

      <ActionButton
        en="Change priority"
        hi="प्राथमिकता बदलें"
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
        en="Assign"
        hi="सौंपें"
        icon={<IconUserPlus className="size-5" stroke={1.6} aria-hidden />}
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
          className="h-11 w-full"
          disabled={busy || !closeGate.ok}
          onClick={() => {
            setActionError(null);
            setDialog("close");
          }}
        >
          <Bi en="Close concern" hi="शिकायत बंद करें" />
        </Button>
        <p className={cn("deva mt-1 text-text-3", T.caption)}>
          {closeGate.ok ? (
            <Bi
              en="The employee can no longer comment on it. Nothing is deleted."
              hi="कर्मचारी इस पर और टिप्पणी नहीं कर सकेगा। कुछ मिटाया नहीं जाएगा।"
            />
          ) : closeGate.why ? (
            <Bi en={closeGate.why.en} hi={closeGate.why.hi} />
          ) : null}
        </p>
      </div>
    </div>
  );

  const employeeName = concern.employeeName ?? "The employee";

  return (
    <Shell>
      <Reveal index={0}>
        <Link
          href="/help-slip/all"
          className={cn(
            "-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-text-3 transition-colors hover:text-text-1",
            T.bodySm,
          )}
        >
          <IconChevronLeft className="size-4" stroke={1.6} aria-hidden />
          <Bi en="All concerns" hi="सभी शिकायतें" />
        </Link>

        <PageHeader
          titleEn={concern.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ConcernNumber value={concern.concernNumber} />
              <span className="deva">
                {employeeName}
                {" · "}
                {departmentOf(concern, locale)}
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
            "deva mb-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-2 px-4 py-2.5 text-text-2",
            T.bodySm,
          )}
        >
          <span>{notice}</span>
          {undoUntil > Date.now() ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setUndoUntil(0);
                setNotice(null);
                run(
                  { action: "reopen", note: UNDO_NOTE },
                  { notice: <Bi en="Resolve undone." hi="हल वापस ले लिया गया।" /> },
                );
              }}
            >
              <Bi en="Undo" hi="वापस लें" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p
          role="alert"
          className={cn(
            "deva mb-3 rounded-card border border-status-red/35 bg-status-red-dim px-4 py-2.5 text-status-red",
            T.bodySm,
          )}
        >
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 pb-10 lg:pb-4">
        {/* ── phone: the rail, folded ─────────────────────────────────── */}
        <Panel className="overflow-hidden lg:hidden">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status} locale={locale} />
                <PriorityChip priority={concern.priority} locale={locale} />
                <SlaLabel
                  slaDueAt={concern.slaDueAt}
                  status={status}
                  locale={locale}
                />
              </span>
              <IconChevronDown
                className="size-5 shrink-0 text-text-3 transition-transform group-open:rotate-180"
                stroke={1.6}
                aria-hidden
              />
            </summary>
            <div className="border-t border-border px-4 py-3">
              <Facts payload={payload} locale={locale} />
            </div>
          </details>
        </Panel>

        {/* pb-20 clears the pinned mobile action bar; the rail replaces it
            from 1024, so it drops there. */}
        <div className="flex flex-col gap-4 pb-20 lg:flex-row lg:items-start lg:gap-8 lg:pb-0">
          {/* ═══ the main column ══════════════════════════════════════ */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* ── the employee's solutions, as selectable cards ─────── */}
            <Reveal index={1}>
              <Panel className="p-4 md:p-5">
                <h2
                  id="ws-solutions"
                  className={cn("deva mb-3 text-text-1", T.h3)}
                >
                  Employee&apos;s suggested solutions
                  <span className="deva hi"> (कर्मचारी के सुझाए समाधान)</span>
                </h2>
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
              </Panel>
            </Reveal>

            {/* ── resolution, when there is one ─────────────────────── */}
            {concern.resolutionMessage ? (
              <Panel className="p-4 md:p-5">
                <h2 className={cn("deva mb-3 text-text-1", T.h3)}>
                  How it was resolved
                  <span className="deva hi"> (कैसे हल हुआ)</span>
                </h2>
                <div className="rounded-field bg-status-green-dim p-4">
                  <p
                    className={cn(
                      "deva whitespace-pre-line text-text-1",
                      T.body,
                    )}
                  >
                    {concern.resolutionMessage}
                  </p>
                </div>
              </Panel>
            ) : null}

            {/* ── the timeline, with the visibility toggle ──────────── */}
            <Reveal index={2}>
              <Panel className="overflow-visible p-4 md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="ws-activity"
                    className={cn("deva text-text-1", T.h3)}
                  >
                    Activity
                    <span className="deva hi"> (गतिविधि)</span>
                  </h2>
                  <Segmented<"public" | "internal">
                    value={timelineView}
                    onChange={setTimelineView}
                    label="Which updates"
                    options={[
                      { value: "public", label: "Public" },
                      { value: "internal", label: "Internal" },
                    ]}
                  />
                </div>

                <Timeline
                  events={visibleUpdates}
                  locale={locale}
                  // Staff, so internal notes render with their dashed
                  // treatment. The toggle above decides WHICH set is on
                  // screen; this decides whether internal ones may be drawn at
                  // all — and this screen is staff-gated on the server.
                  canSeeInternal
                  targetId={targetId}
                />
              </Panel>
            </Reveal>

            {/* ── the composer ─────────────────────────────────────── *
             * ══ INTERNAL NOTE vs PUBLIC REPLY ═══════════════════════
             * The single most important distinction on this screen, and it is
             * carried FOUR ways at once, none of them colour alone:
             *
             *   1. a different GROUND — the whole composer switches to the
             *      chip fill and a dashed border, which is exactly how an
             *      internal row is drawn in the timeline below it;
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
            <Reveal index={3}>
              <Panel
                className={cn(
                  "p-4 transition-colors md:p-5",
                  isInternal && "border-dashed border-border-strong bg-chip",
                )}
              >
                <h2
                  id="ws-compose"
                  className={cn(
                    "deva mb-1 flex items-center gap-2 text-text-1",
                    T.h3,
                  )}
                >
                  {isInternal ? (
                    <IconLock className="size-4 shrink-0" stroke={1.6} aria-hidden />
                  ) : null}
                  {isInternal ? (
                    <>
                      Internal note
                      <span className="deva hi"> (आंतरिक नोट)</span>
                    </>
                  ) : (
                    <>
                      Reply to the employee
                      <span className="deva hi"> (कर्मचारी को जवाब)</span>
                    </>
                  )}
                </h2>

                <p
                  className={cn(
                    "deva mb-3",
                    isInternal
                      ? "font-semibold text-text-2"
                      : "text-text-3",
                    T.caption,
                  )}
                >
                  {isInternal ? (
                    <Bi
                      en={TIMELINE_COPY.internalNote.en}
                      hi={TIMELINE_COPY.internalNote.hi}
                    />
                  ) : (
                    <Bi
                      en="This appears on the employee's own page."
                      hi="यह कर्मचारी के अपने पेज पर दिखेगा।"
                    />
                  )}
                </p>

                <div className="flex flex-col gap-2">
                  <TextAreaField
                    id="ws-compose-box"
                    labelEn="Add an update"
                    labelHi="अपडेट जोड़ें"
                    // The heading above already says which kind this is. A
                    // visible label repeating it is one more line to read and
                    // nothing to learn — so it stays as the ACCESSIBLE name
                    // only, which a screen reader still needs because a
                    // heading is not programmatically a field's label.
                    labelHidden
                    placeholder="What has happened? (क्या हुआ है?)"
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
                    labelHi="आंतरिक नोट (कर्मचारी को नहीं दिखेगा)"
                    descriptionEn="Only coordinators can read it. It never appears in their timeline."
                    descriptionHi="इसे सिर्फ़ कोऑर्डिनेटर पढ़ सकते हैं। कर्मचारी की टाइमलाइन में कभी नहीं आएगा।"
                    disabled={isClosed || busy}
                  />

                  <Button
                    type="button"
                    variant={isInternal ? "secondary" : "default"}
                    size="lg"
                    onClick={post}
                    disabled={isClosed || busy || draft.trim().length === 0}
                    className="h-11 w-full px-5 text-base md:w-auto md:self-start"
                  >
                    {busy ? <Spinner /> : null}
                    {isInternal ? (
                      <Bi en="Post internal note" hi="आंतरिक नोट सेव करें" />
                    ) : (
                      <Bi en="Post reply" hi="जवाब भेजें" />
                    )}
                  </Button>
                </div>
              </Panel>
            </Reveal>
          </div>

          {/* ═══ the rail, 1024+ ══════════════════════════════════════ */}
          <aside className="hidden w-80 shrink-0 lg:sticky lg:top-4 lg:block">
            <Panel className="flex flex-col gap-3 p-4 md:p-5">
              <Facts payload={payload} locale={locale} withStatus />
              <div className="border-t border-border pt-3">
                {actionStack(true)}
              </div>
            </Panel>
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
          "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:left-[264px] lg:hidden",
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
              <Bi en="Resolve" hi="हल करें" />
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
          className="max-h-[85vh] overflow-y-auto rounded-t-card"
        >
          <SheetHeader>
            <SheetTitle className={cn("deva", T.h3)}>
              <Bi en="Actions" hi="कार्रवाई" />
            </SheetTitle>
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
        titleHi="रोक लगाएँ"
        descriptionEn="Say what it is waiting for. The employee sees this note."
        descriptionHi="बताइए किस चीज़ का इंतज़ार है। यह नोट कर्मचारी को दिखेगा।"
        error={actionError}
        footer={
          <>
            <ModalCancel disabled={busy} />
            <Button
              type="button"
              className="h-11"
              disabled={busy || holdNote.trim().length === 0}
              onClick={() =>
                run(
                  { action: "hold", reason: holdReason, note: holdNote.trim() },
                  { onDone: () => setHoldNote("") },
                )
              }
            >
              {busy ? <Spinner /> : null}
              <Bi en="Put on hold" hi="रोक लगाएँ" />
            </Button>
          </>
        }
      >
        <SelectField
          id="ws-hold-reason"
          labelEn="Waiting for"
          labelHi="किसका इंतज़ार"
          value={holdReason}
          onChange={(v) => setHoldReason(v as WaitReason)}
          // Never the raw enum: `awaiting_vendor` is a storage value and
          // "A vendor" is the answer to the question this asks.
          options={WAIT_REASONS.map((r) => ({
            value: r,
            label: `${WAIT_REASON_META[r].labelEn} (${WAIT_REASON_META[r].labelHi})`,
          }))}
          disabled={busy}
        />
        <TextAreaField
          id="ws-hold-note"
          labelEn="Note"
          labelHi="नोट"
          helperEn="Required. A hold with no explanation reads as being ignored."
          helperHi="ज़रूरी है। बिना वजह की रोक अनदेखी जैसी लगती है।"
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
        titleHi="यह शिकायत दोबारा खोलें"
        descriptionEn="It goes back to in progress and the employee is told why."
        descriptionHi="यह फिर से चालू हो जाएगी और कर्मचारी को वजह बताई जाएगी।"
        error={actionError}
        footer={
          <>
            <ModalCancel disabled={busy} />
            <Button
              type="button"
              className="h-11"
              disabled={busy || reopenNote.trim().length === 0}
              onClick={() =>
                run(
                  { action: "reopen", note: reopenNote.trim() },
                  { onDone: () => setReopenNote("") },
                )
              }
            >
              {busy ? <Spinner /> : null}
              <Bi en="Reopen" hi="दोबारा खोलें" />
            </Button>
          </>
        }
      >
        <TextAreaField
          id="ws-reopen-note"
          labelEn="Why is it being reopened?"
          labelHi="दोबारा क्यों खोला जा रहा है?"
          helperEn="Required. The employee reads this as the reason it came back."
          helperHi="ज़रूरी है। कर्मचारी इसे ही वापस खुलने की वजह के रूप में पढ़ेगा।"
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
        titleHi="प्राथमिकता बदलें"
        error={actionError}
        footer={<ModalCancel disabled={busy} />}
      >
        {PRIORITIES.map((p) => (
          <ChoiceRow
            key={p}
            label={
              locale === "hi"
                ? PRIORITY_META[p].labelHi
                : PRIORITY_META[p].labelEn
            }
            selected={p === concern.priority}
            disabled={busy}
            onClick={() => run({ action: "priority", priority: p })}
          />
        ))}
      </HsModal>

      <HsModal
        open={dialog === "assign"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        titleEn="Assign this concern"
        titleHi="यह शिकायत सौंपें"
        descriptionEn="Active coordinators and admins only."
        descriptionHi="सिर्फ़ सक्रिय कोऑर्डिनेटर और एडमिन।"
        error={actionError}
        footer={<ModalCancel disabled={busy} />}
      >
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
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
                labelHi="मुझे सौंपें"
                selected={concern.assignedTo === me.id}
                disabled={busy}
                onClick={() => run({ action: "assign", assigneeId: me.id })}
              />
            );
          })()}

          <ChoiceRow
            label="Nobody"
            labelHi="किसी को नहीं"
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
        titleHi="यह शिकायत बंद करें?"
        descriptionEn="The employee can no longer comment on it. Nothing is deleted."
        descriptionHi="कर्मचारी इस पर और टिप्पणी नहीं कर सकेगा। कुछ मिटाया नहीं जाएगा।"
        error={actionError}
        footer={
          <>
            <ModalCancel disabled={busy} />
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={busy}
              onClick={() => run({ action: "close" })}
            >
              {busy ? <Spinner /> : null}
              <Bi en="Confirm" hi="पक्का करें" />
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
    <div className="mx-auto flex w-full max-w-[1180px] flex-col">{children}</div>
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
  en,
  hi,
  icon,
  onClick,
  disabled,
  reason,
  dense,
}: {
  en: string;
  hi: string;
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
        <Bi en={en} hi={hi} />
      </Button>
      {reason ? (
        <p className={cn("deva mt-1 text-text-3", T.caption)}>
          <Bi en={reason.en} hi={reason.hi} />
        </p>
      ) : null}
    </div>
  );
}

/** The line under a disabled primary, for the same reason as above. */
function Why({ reason }: { reason: BlockedReason | null }) {
  if (!reason) return null;
  return (
    <p className={cn("deva mt-1 text-text-3", T.caption)}>
      <Bi en={reason.en} hi={reason.hi} />
    </p>
  );
}

/** A pickable row in the priority and assign prompts. */
function ChoiceRow({
  label,
  labelHi,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  labelHi?: string;
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
        "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-field border px-3 py-2 text-left transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-accent"
          : "border-border hover:bg-surface-2",
      )}
    >
      <span className={cn("deva text-text-1", T.bodySm)}>
        <Bi en={label} hi={labelHi} />
      </span>
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
  locale,
  withStatus = false,
}: {
  payload: ConcernDetailPayload;
  locale: "en" | "hi";
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
          <MetaRow labelEn="Status" labelHi="स्थिति">
            <span className="flex flex-wrap items-center gap-1">
              <StatusBadge status={concern.status} locale={locale} />
              {concern.isOverdue ? <OverdueBadge locale={locale} /> : null}
            </span>
          </MetaRow>
          <MetaRow labelEn="Priority" labelHi="प्राथमिकता">
            <PriorityChip
              priority={concern.priority}
              locale={locale}
              alwaysShow
            />
          </MetaRow>
        </>
      ) : null}

      <MetaRow labelEn="Assigned" labelHi="सौंपी गई">
        <span className={cn(!concern.assignedToName && "text-text-3")}>
          {concern.assignedToName ?? <Bi en="Nobody" hi="किसी को नहीं" />}
        </span>
      </MetaRow>
      <MetaRow labelEn="Employee" labelHi="कर्मचारी">
        <span className="block">{typed || account || "—"}</span>
        {differs ? (
          <span className={cn("deva mt-0.5 block text-text-3", T.caption)}>
            <Bi
              en={`Filed from ${account ?? ""}`}
              hi={`${account ?? ""} के खाते से दर्ज`}
            />
          </span>
        ) : null}
      </MetaRow>
      <MetaRow labelEn="Department" labelHi="विभाग">
        {departmentOf(concern, locale)}
      </MetaRow>
      <MetaRow labelEn="Raised" labelHi="दर्ज">
        <span className="num">{absoluteTime(concern.createdAt, locale)}</span>
      </MetaRow>
      <MetaRow labelEn="SLA due" labelHi="एसएलए">
        <SlaLabel
          slaDueAt={concern.slaDueAt}
          status={concern.status}
          locale={locale}
        />
      </MetaRow>
      {concern.waitReason ? (
        <MetaRow labelEn="Waiting for" labelHi="किसका इंतज़ार">
          <Bi
            en={WAIT_REASON_META[concern.waitReason].labelEn}
            hi={WAIT_REASON_META[concern.waitReason].labelHi}
          />
        </MetaRow>
      ) : null}
      {concern.resolvedAt ? (
        <MetaRow labelEn="Resolved" labelHi="हल">
          <span className="num">
            {absoluteTime(concern.resolvedAt, locale)}
          </span>
        </MetaRow>
      ) : null}
    </dl>
  );
}

/** The same shape as the real screen, so nothing jumps when it arrives. */
function WorkspaceSkeleton() {
  return (
    <Shell>
      <div
        className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start lg:gap-8"
        aria-busy
        role="status"
      >
        <span className="sr-only">Loading concern</span>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
        <div className="hidden w-80 shrink-0 lg:block">
          <Skeleton className="h-96 rounded-card" />
        </div>
      </div>
    </Shell>
  );
}
