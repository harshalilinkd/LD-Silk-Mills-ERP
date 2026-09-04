"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBulb,
  IconChevronLeft,
  IconCircleCheck,
  IconSearch,
  IconSend,
  IconTimeline,
  IconTrash,
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
  ModalCancel,
  SolutionList,
} from "@/components/help-slip/concern-parts";
import { FormAlert, TextAreaField } from "@/components/help-slip/form-parts";
import {
  CountChip,
  MetaItem,
  MetaStrip,
  PageHeader,
  Panel,
  SectionCard,
} from "@/components/help-slip/page-parts";
import { AttachmentsPanel } from "./attachments-panel";
import { Timeline } from "@/components/help-slip/timeline";
import { T } from "@/components/help-slip/type-scale";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { useHelpSlipSession } from "@/lib/help-slip/context";
import {
  absoluteTime,
  departmentOf,
  relativeTime,
} from "@/lib/help-slip/format";
import { MESSAGE_MAX, type ConcernDetailPayload } from "@/lib/help-slip/types";
import { HELP_SLIP_STALE_TIME } from "@/lib/help-slip/use-unread-count";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  One concern, as the person who raised it sees it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's
 * `src/features/concerns/screens/ConcernDetail.tsx`.
 *
 * Laid out the way the ERP lays out every detail screen: back link, record
 * header, metadata strip, then the body sections as cards with an accent icon
 * chip on each head. One column at every width.
 *
 * The facts used to live in a 320px rail from 1024 and in a `<details>` fold
 * below it — one block written once and rendered twice, folded shut on the
 * device most of this company actually has. As a full-width strip directly
 * under the header they are two facts across on a phone and four from `sm`,
 * they cost no tap to reach, and there is only one of them.
 *
 * The section order still answers the reader's questions in the order they ask
 * them: what is this, what did I suggest, how was it fixed, what has happened,
 * can I say more.
 *
 * ── NOT FOUND IS A FEATURE ────────────────────────────────────────────────
 *
 * The route answers a concern you may not read with a 200 and `null` — RLS
 * returns zero rows rather than raising, so a guessed uuid, a typo'd one and a
 * real one belonging to somebody else are indistinguishable. This screen
 * renders the SAME "Not found" for all three, and that sameness is the
 * security property: a different message for "exists but not yours" would
 * confirm the id.
 *
 * ── INTERNAL NOTES ────────────────────────────────────────────────────────
 *
 * `canSeeInternal` is passed FALSE, as a literal, with no branch behind it.
 * Not `viewerIsStaff`, not a prop, not a ternary — this screen has no code
 * path that renders an internal note to anybody. It is the fourth lock:
 * `v_concern_updates` refuses those rows, `loadConcernUpdates` refuses them
 * again for a non-staff reader, `<Timeline>` filters them a third time, and
 * this call site cannot ask for them at all. A coordinator who wants to read
 * their own notes has the workspace.
 */
export function ConcernDetail({ id }: { id: string }) {
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

  const [draft, setDraft] = React.useState("");
  const [confirmWithdraw, setConfirmWithdraw] = React.useState(false);

  const payload = q.data ?? null;

  /**
   * Commenting, OPTIMISTICALLY — the one optimistic write on this screen, and
   * the only one the source has here either.
   *
   * The comment is appended to the cached payload the moment it is sent and
   * the box is cleared alongside it: leaving the text in the box next to a
   * copy of itself in the thread reads as a failed send. On failure the whole
   * previous payload is put back (not the row filtered out — that would drop
   * anything a concurrent refetch had added) and the text returns to the box.
   *
   * On success the response IS the freshly re-read page, so the cache is
   * REPLACED with it rather than reconciled: the optimistic row disappears and
   * the server's row — with its real id, timestamp and actor — takes its
   * place, in one round trip.
   */
  const comment = useMutation({
    mutationFn: (message: string) =>
      helpSlipSend<ConcernDetailPayload | null>(
        `/api/help-slip/concerns/${id}`,
        "POST",
        { action: "comment", message, isInternal: false },
      ),
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ConcernDetailPayload | null>(
        queryKey,
      );
      if (previous) {
        queryClient.setQueryData<ConcernDetailPayload>(queryKey, {
          ...previous,
          updates: [
            ...previous.updates,
            {
              // A temp id the server will never mint, so the reconciled row
              // replaces it rather than rendering twice.
              id: `optimistic-${Date.now()}`,
              createdAt: new Date().toISOString(),
              type: "comment",
              message,
              isInternal: false,
              actorName: session.fullName,
              actorRole: session.role,
              isOwnAction: true,
              oldStatus: null,
              newStatus: null,
              acceptedSolutionPosition: null,
            },
          ],
        });
      }
      return { previous };
    },
    onError: (_e, message, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setDraft(message);
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKey, fresh);
      // The list's "last update" column and the unread count both moved.
      void queryClient.invalidateQueries({
        queryKey: ["help-slip", "concerns"],
      });
    },
  });

  /**
   * Take it back.
   *
   * Everything that matters happens in the database — `withdraw_concern`
   * re-checks ownership from `auth.uid()`, writes the audit line and hides the
   * row from every reader, author included. Nothing is hard-deleted. The
   * screen it was on has just stopped existing, so this leaves.
   */
  const withdraw = useMutation({
    mutationFn: () =>
      helpSlipSend<ConcernDetailPayload | null>(
        `/api/help-slip/concerns/${id}`,
        "POST",
        { action: "withdraw" },
      ),
    onSuccess: () => {
      setConfirmWithdraw(false);
      queryClient.removeQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["help-slip"] });
      router.push("/help-slip/concerns");
    },
  });

  // ── the four states ────────────────────────────────────────────────────

  if (q.isPending) return <DetailSkeleton />;

  if (q.isError) {
    return (
      <Shell>
        {/* Carded, like every other region in this module: a bare block of
            centred text on the page ground reads as a rendering failure
            rather than as a message about one. */}
        <Panel>
          <div className="flex flex-col items-center gap-3 pb-6">
            <EmptyState
              icon={IconSearch}
              title="We couldn't load this concern."
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
    // The SAME words for a bad id and for somebody else's concern. See the
    // note at the top of this file — the sameness is the point.
    return (
      <Shell>
        <Panel>
          <div className="flex flex-col items-center gap-3 pb-6">
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
              onClick={() => router.push("/help-slip/concerns")}
            >
              Back to my concerns
            </Button>
          </div>
        </Panel>
      </Shell>
    );
  }

  const { concern, solutions, updates, viewerIsStaff } = payload;
  const isClosed = concern.status === "closed";
  const canComment = !isClosed && (concern.isMine || viewerIsStaff);

  const send = () => {
    const body = draft.trim();
    if (!body || comment.isPending) return;
    setDraft("");
    comment.mutate(body);
  };

  return (
    <Shell>
      {/*
        Back link and record header, as ONE stagger step and 16px apart rather
        than the page root's 20px: the link carries a 44px tap row below md and
        already supplies most of that air itself.
      */}
      <Reveal index={0} className="flex flex-col gap-4">
        <Link
          href="/help-slip/concerns"
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
          My concerns
        </Link>

        {/*
          THE RECORD HEADER — title left, state hard right, ONE context line
          under the title, where the source once had three stacked rows: the
          number, then a badge row, then the raised-on date. About 90px to say
          five short things, none of which is a sentence.
        */}
        <PageHeader
          titleEn={concern.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ConcernNumber value={concern.concernNumber} />
              {concern.visibility === "hr_only" ? <ConfidentialMark /> : null}
            </span>
          }
          actions={
            <>
              <StatusBadge status={concern.status} size="md" />
              {concern.isOverdue ? <OverdueBadge size="md" /> : null}
              {/* No alwaysShow: priority renders nothing for low/normal, so
                  it never competes with the status badge beside it. */}
              <PriorityChip priority={concern.priority} />
            </>
          }
        />
      </Reveal>

      {/* ── 1. the facts, as the ERP's metadata strip ─────────────────── */}
      <Reveal index={1}>
        <Facts payload={payload} />
      </Reveal>

      {/* ── 2. the solutions — the heart of the product ───────────────── */}
      <Reveal index={2}>
        <SectionCard
          icon={<IconBulb />}
          title={
            <span id="detail-solutions">
              {concern.isMine
                ? "Your suggested solutions"
                : "Suggested solutions"}
            </span>
          }
          aside={<CountChip>{solutions.length}</CountChip>}
        >
          {/* Read-only: no `onPick`, so the accepted one is marked and
              nothing is selectable. The coordinator picks in the
              workspace. */}
          <SolutionList
            solutions={solutions}
            acceptedId={concern.acceptedSolutionId}
            labelledBy="detail-solutions"
          />
        </SectionCard>
      </Reveal>

      {/* ── 2b. the photographs ───────────────────────────────────────── *
       * Renders itself away when there is nothing to show and nothing can
       * be added, so a closed concern with no photos gains no empty card.
       * `canAdd` is the same rule as the comment box: not closed, and either
       * yours or you work the queue. The server checks it again — this only
       * decides whether the button is on screen.                          */}
      <Reveal index={3}>
        <AttachmentsPanel concernId={id} canAdd={canComment} />
      </Reveal>

      {/* ── 3. how it was resolved, when it was ───────────────────────── */}
      {concern.resolutionMessage ? (
        <Reveal index={3}>
          <SectionCard
            icon={<IconCircleCheck />}
            title={<span id="detail-resolution">How it was resolved</span>}
          >
            {/* The ERP's left-rule callout, "ok" tone: a 3px rule says this
                block is different in kind. */}
            <div className="rounded-field border-l-[3px] border-l-status-green bg-status-green-dim px-3 py-2.5">
              <p className={cn("whitespace-pre-line text-text-1", T.body)}>
                {concern.resolutionMessage}
              </p>
            </div>
          </SectionCard>
        </Reveal>
      ) : null}

      {/* ── 4. activity AND the composer, in ONE card ─────────────────── *
       * They are one conversation: the thread, and the box you add to it.
       * Split, the second card's head would say "Add a comment" directly
       * under a card whose last element is the thing you would be commenting
       * on.                                                                */}
      <Reveal index={4}>
        <SectionCard
          icon={<IconTimeline />}
          title={<span id="detail-activity">Activity</span>}
        >
          <Timeline
            events={updates}
            /* FALSE, as a literal. See the header of this file — this
               screen has no code path that renders an internal note. */
            canSeeInternal={false}
            targetId={targetId}
          />

          {isClosed ? (
            /* DISABLED WITH THE REASON VISIBLE, never a mystery grey box.
               This mirrors a real database rule — `updates_insert_employee`
               requires status <> 'closed' — so letting somebody type a
               paragraph here would end in a rejected request and a lost
               paragraph. */
            <FormAlert tone="neutral" role="status">
              This concern is closed. Contact the coordinator to reopen it.
            </FormAlert>
          ) : canComment ? (
            /* A DASHED rule, which in this ERP means "controls that act on
               THIS card" — distinct from the solid rule that separates one
               kind of content from another. */
            <div className="flex flex-col gap-2 border-t border-dashed border-border-strong pt-3">
              <TextAreaField
                id="detail-comment"
                labelEn="Add a comment"
                placeholder="Anything to add?"
                value={draft}
                onChange={setDraft}
                rows={3}
                maxLength={MESSAGE_MAX}
                disabled={comment.isPending}
              />

              {comment.isError ? (
                <FormAlert>{(comment.error as Error).message}</FormAlert>
              ) : null}

              <Button
                type="button"
                size="lg"
                onClick={send}
                disabled={draft.trim().length === 0 || comment.isPending}
                // 44px + 16px text below md: the minimum touch target for
                // a phone held on the factory floor, and anything under
                // 16px makes iOS Safari auto-zoom on focus and never zoom
                // back out. ERP-compact (36px / 13px) from md up.
                className="h-11 w-full px-5 text-base md:h-9 md:w-auto md:self-start md:px-3 md:text-sm"
              >
                {comment.isPending ? (
                  <Spinner />
                ) : (
                  <IconSend
                    className="size-5 md:size-4"
                    stroke={1.6}
                    aria-hidden
                  />
                )}
                {comment.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          ) : null}
        </SectionCard>
      </Reveal>

      {/* ── take it back ──────────────────────────────────────────────── *
       * Owner only, and last on the page. Carded like everything else —
       * nothing in this module floats on the page ground — but deliberately
       * HEADLESS and uncoloured: no icon chip, no heading, no red fill. A
       * destructive action should be findable when you want it and never the
       * thing your eye lands on.
       *
       * Hidden once it is closed (there is nothing left to take back), and
       * hidden for staff, who have Close for the same job and must not be
       * able to remove somebody else's complaint from here.                */}
      {concern.isMine && !isClosed ? (
        <Reveal index={5}>
          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cn("min-w-0 text-text-3", T.caption)}>
                It disappears for you and for the coordinators. This cannot be
                undone.
              </p>
              <Button
                type="button"
                variant="ghost"
                // 44px below md (factory-floor touch target); the ERP's
                // 36px destructive-tinted ghost from md up.
                className="h-11 shrink-0 text-status-red hover:bg-status-red-dim hover:text-status-red md:h-9"
                onClick={() => setConfirmWithdraw(true)}
              >
                <IconTrash
                  className="size-5 md:size-4"
                  stroke={1.6}
                  aria-hidden
                />
                Delete this concern
              </Button>
            </div>
          </SectionCard>
        </Reveal>
      ) : null}

      {/*
        Escapable on purpose. A persistent dialog is for one holding unsaved
        edits, where an outside click costs you typing. This holds no input at
        all, and trapping somebody inside a confirmation they opened by
        accident is the hostile version of being careful.
      */}
      <HsModal
        open={confirmWithdraw}
        onOpenChange={(open) => {
          if (!open) setConfirmWithdraw(false);
        }}
        titleEn="Delete this concern?"
        descriptionEn="It will no longer appear anywhere, for you or for the coordinators. This cannot be undone."
        error={withdraw.isError ? (withdraw.error as Error).message : undefined}
        footer={
          <>
            <ModalCancel disabled={withdraw.isPending} />
            <Button
              type="button"
              variant="destructive"
              // 44px below md, ERP-compact 36px from md up — see the back
              // link at the top of this screen.
              className="h-11 md:h-9"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              {withdraw.isPending ? <Spinner /> : null}
              {withdraw.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />
    </Shell>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * The measure, and the page rhythm.
 *
 * `gap-5` is the ERP page root: the header and every region below it are
 * siblings 20px apart, and `PageHeader` carries no bottom padding of its own
 * precisely so that this gap is the only thing setting that distance.
 *
 * MODULE LEVEL, and that is not a style preference. Declared inside the screen
 * this would be a NEW component type on every render, so React would unmount
 * and remount the whole subtree on each keystroke and the comment box would
 * lose focus after one character. A component defined during render is never
 * the same component twice.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      {children}
    </div>
  );
}

/**
 * The facts, as the ERP's metadata strip: 11px uppercase labels over 13px
 * values, two columns on a phone and four from `sm`. A missing value prints an
 * em dash rather than a blank — `MetaItem` does that for us, because an empty
 * cell reads as a rendering bug and "we do not have this" is information.
 *
 * Status is NOT in here. It sits beside the title in the record header, which
 * is where this ERP puts a record's state; repeating it 40px lower would answer
 * a question the reader has already had answered.
 *
 * Priority IS, and the two are not the same case. The header chip deliberately
 * omits `alwaysShow` so a routine concern does not carry a chip competing with
 * the status badge — but that means low and normal render NOTHING up there, and
 * "what priority is this?" then has no answer anywhere on the screen. So the
 * header flags priority only when it is worth flagging, and this strip states
 * it always.
 */
function Facts({ payload }: { payload: ConcernDetailPayload }) {
  const { concern } = payload;

  /*
    WHO FILED IT, and the one distinction this block must not blur.

    `filedForName` is what somebody typed into the Name box on the form.
    `employeeName` is the account that authenticated, and it is the only one of
    the two that is identity. They WILL disagree the first time a slip is filed
    on a shared factory phone.

    So the typed name LEADS, because that is what the person filing meant, and
    the account is named under it, muted, only when the two differ.
  */
  const typed = concern.filedForName?.trim();
  const account = concern.employeeName ?? null;
  const differs = Boolean(typed && account && typed !== account);

  return (
    <MetaStrip>
      <MetaItem label="Department">{departmentOf(concern)}</MetaItem>

      <MetaItem label="Priority">
        <PriorityChip priority={concern.priority} alwaysShow />
      </MetaItem>

      <MetaItem label="Raised by">
        <span className="block">{typed || account || "—"}</span>
        {differs ? (
          <span className={cn("mt-0.5 block text-text-3", T.caption)}>
            {`Filed from ${account ?? ""}`}
          </span>
        ) : null}
      </MetaItem>

      <MetaItem label="Coordinator">
        <span className={cn(!concern.assignedToName && "text-text-3")}>
          {concern.assignedToName ?? "Not assigned yet"}
        </span>
      </MetaItem>

      <MetaItem label="Raised" numeric>
        {absoluteTime(concern.createdAt)}
      </MetaItem>

      {concern.lastPublicUpdateAt ? (
        <MetaItem label="Last update" numeric>
          {relativeTime(concern.lastPublicUpdateAt)}
        </MetaItem>
      ) : null}

      {concern.status !== "resolved" &&
      concern.status !== "closed" &&
      concern.slaDueAt ? (
        <MetaItem label="Due" numeric>
          <span className={cn(concern.isOverdue && "text-status-red")}>
            {absoluteTime(concern.slaDueAt)}
          </span>
        </MetaItem>
      ) : null}

      {concern.resolvedAt ? (
        <MetaItem label="Resolved" numeric>
          {absoluteTime(concern.resolvedAt)}
        </MetaItem>
      ) : null}
    </MetaStrip>
  );
}

/** The same shape as the real page, so nothing jumps when it arrives. */
function DetailSkeleton() {
  return (
    <Shell>
      <div className="flex flex-col gap-5" aria-busy role="status">
        <span className="sr-only">Loading concern</span>

        {/* The back link, then the record header: a 33px h1 line box over a
            19.5px subtitle, both at the module's own line height. */}
        <Skeleton className="h-[19.5px] w-28" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-[33px] w-3/4" />
          <Skeleton className="h-[19.5px] w-48" />
        </div>

        {/* The metadata strip, then the two cards that always draw. */}
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-44 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </Shell>
  );
}
