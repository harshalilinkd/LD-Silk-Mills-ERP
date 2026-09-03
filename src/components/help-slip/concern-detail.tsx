"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronDown,
  IconChevronLeft,
  IconSearch,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";

import { OverdueBadge, PriorityChip, StatusBadge } from "@/components/help-slip/badges";
import { Bi } from "@/components/help-slip/bilingual";
import {
  ConcernNumber,
  ConfidentialMark,
  HsModal,
  MetaRow,
  ModalCancel,
  SolutionList,
} from "@/components/help-slip/concern-parts";
import { TextAreaField } from "@/components/help-slip/form-parts";
import { PageHeader, Panel } from "@/components/help-slip/page-parts";
import { Timeline } from "@/components/help-slip/timeline";
import { T } from "@/components/help-slip/type-scale";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { useHelpSlipLocale, useHelpSlipSession } from "@/lib/help-slip/context";
import { absoluteTime, departmentOf, relativeTime } from "@/lib/help-slip/format";
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
 * The mobile order IS the design, and it answers the reader's questions in the
 * order they actually ask them: what is this, what did I suggest, what has
 * happened, can I say more. Meta — status, priority, coordinator, dates — is
 * the LAST thing an employee needs and the first thing a coordinator scans,
 * which is why it folds into a `<details>` on a phone and becomes a rail at
 * 1024 rather than sitting above the content.
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
      helpSlipGet<ConcernDetailPayload | null>(
        `/api/help-slip/concerns/${id}`,
      ),
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
      const previous =
        queryClient.getQueryData<ConcernDetailPayload | null>(queryKey);
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
      void queryClient.invalidateQueries({ queryKey: ["help-slip", "concerns"] });
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
        <div className="py-10">
          <EmptyState
            icon={IconSearch}
            title={
              <Bi
                en="We couldn't load this concern."
                hi="यह शिकायत लोड नहीं हो सकी।"
              />
            }
            description={(q.error as Error).message}
          />
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              onClick={() => void q.refetch()}
            >
              <Bi en="Try again" hi="दोबारा कोशिश करें" />
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (!payload) {
    // The SAME words for a bad id and for somebody else's concern. See the
    // note at the top of this file — the sameness is the point.
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
            // 44px below md (factory-floor touch target); ERP 36px at md+.
            className="h-11 md:h-9"
            onClick={() => router.push("/help-slip/concerns")}
          >
            <Bi en="Back to my concerns" hi="मेरी शिकायतों पर लौटें" />
          </Button>
        </div>
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
      <Reveal index={0}>
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
          <Bi en="My concerns" hi="मेरी शिकायतें" />
        </Link>

        {/*
          ONE meta line, where the source once had three stacked ones: the
          number under the title, a badge row under that, and the raised-on
          date under that again — about 90px to say five short things, none of
          which is a sentence.
        */}
        <PageHeader
          titleEn={concern.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ConcernNumber value={concern.concernNumber} />
              {concern.visibility === "hr_only" ? <ConfidentialMark /> : null}
            </span>
          }
        />
      </Reveal>

      <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* ── 1. where it stands, on the CANVAS ─────────────────────── */}
          <Reveal index={1}>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={concern.status} size="md" bilingual />
                {concern.isOverdue ? (
                  <OverdueBadge size="md" locale={locale} />
                ) : null}
                {/* No alwaysShow: priority renders nothing for low/normal, so
                    it never competes with the status badge beside it. */}
                <PriorityChip priority={concern.priority} locale={locale} />
              </div>

              <p className={cn("deva text-text-3", T.caption)}>
                {departmentOf(concern, locale)}
                {" · "}
                <span className="num">
                  {`Raised ${absoluteTime(concern.createdAt, locale)}`}
                </span>
                {concern.lastPublicUpdateAt ? (
                  <>
                    {" · "}
                    <span className="num">
                      {`Updated ${relativeTime(concern.lastPublicUpdateAt, locale)}`}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </Reveal>

          {/* ── 2. the solutions — the heart of the product ───────────── */}
          <Reveal index={2}>
            <Panel className="p-3 sm:p-4">
              <h2
                id="detail-solutions"
                className={cn("deva mb-2.5 text-text-1", T.h3)}
              >
                {concern.isMine
                  ? "Your suggested solutions"
                  : "Suggested solutions"}
                <span className="deva hi"> (आपके सुझाए समाधान)</span>
              </h2>
              {/* Read-only: no `onPick`, so the accepted one is marked and
                  nothing is selectable. The coordinator picks in the
                  workspace. */}
              <SolutionList
                solutions={solutions}
                acceptedId={concern.acceptedSolutionId}
                labelledBy="detail-solutions"
              />
            </Panel>
          </Reveal>

          {/* ── 3. how it was resolved, when it was ───────────────────── */}
          {concern.resolutionMessage ? (
            <Reveal index={3}>
              <Panel className="p-3 sm:p-4">
                <h2
                  id="detail-resolution"
                  className={cn("deva mb-2.5 text-text-1", T.h3)}
                >
                  How it was resolved
                  <span className="deva hi"> (कैसे हल हुआ)</span>
                </h2>
                {/* The ERP's left-rule callout, "ok" tone: a 3px rule says
                    this block is different in kind. */}
                <div className="rounded-field border-l-[3px] border-l-status-green bg-status-green-dim px-3 py-2.5">
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
            </Reveal>
          ) : null}

          {/* ── 4. activity AND the composer, in ONE panel ────────────── *
           * They are one conversation: the thread, and the box you add to
           * it. Split, the second panel header says "Add a comment" directly
           * under a panel whose last element is the thing you would be
           * commenting on.                                                 */}
          <Reveal index={4}>
            <Panel className="overflow-visible p-3 sm:p-4">
              <h2
                id="detail-activity"
                className={cn("deva mb-2.5 text-text-1", T.h3)}
              >
                Activity
                <span className="deva hi"> (गतिविधि)</span>
              </h2>

              <Timeline
                events={updates}
                locale={locale}
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
                <p
                  role="status"
                  className={cn(
                    "deva mt-3 rounded-field border-l-[3px] border-l-border-strong bg-surface-2 px-3 py-2.5 text-text-2",
                    T.bodySm,
                  )}
                >
                  <Bi
                    en="This concern is closed. Contact the coordinator to reopen it."
                    hi="यह शिकायत बंद है। दोबारा खोलने के लिए कोऑर्डिनेटर से संपर्क करें।"
                  />
                </p>
              ) : canComment ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  <TextAreaField
                    id="detail-comment"
                    labelEn="Add a comment"
                    labelHi="टिप्पणी जोड़ें"
                    placeholder="Anything to add? (कुछ और बताना है?)"
                    value={draft}
                    onChange={setDraft}
                    rows={3}
                    maxLength={MESSAGE_MAX}
                    disabled={comment.isPending}
                  />

                  {comment.isError ? (
                    <p
                      role="alert"
                      className={cn("deva text-status-red", T.caption)}
                    >
                      {(comment.error as Error).message}
                    </p>
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
                    <Bi
                      en={comment.isPending ? "Sending…" : "Send"}
                      hi={comment.isPending ? undefined : "भेजें"}
                    />
                  </Button>
                </div>
              ) : null}
            </Panel>
          </Reveal>

          {/* ── the same facts, on a phone ────────────────────────────── *
           * The rail is `hidden lg:block`, so below 1024 an employee would
           * otherwise see no status, no department, no due date at all — on
           * the device most of this company actually has. A fold, closed by
           * default: one tap, and it costs the page none of the 320px the
           * rail takes.                                                    */}
          <details className="group lg:hidden">
            <summary
              className={cn(
                "deva flex min-h-11 cursor-pointer list-none items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-text-1 shadow-sm",
                T.label,
              )}
            >
              <Bi en="Details" hi="जानकारी" />
              <IconChevronDown
                className="size-4 shrink-0 text-text-3 transition-transform group-open:rotate-180"
                stroke={1.6}
                aria-hidden
              />
            </summary>
            <div className="pt-3">
              <Facts payload={payload} locale={locale} />
            </div>
          </details>

          {/* ── take it back ──────────────────────────────────────────── *
           * Owner only, and last on the page. Separated by a rule and given
           * no colour of its own: a destructive action should be findable
           * when you want it and never the thing your eye lands on.
           *
           * Hidden once it is closed (there is nothing left to take back),
           * and hidden for staff, who have Close for the same job and must
           * not be able to remove somebody else's complaint from here.      */}
          {concern.isMine && !isClosed ? (
            <div className="mt-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                // 44px below md (factory-floor touch target); the ERP's
                // 36px destructive-tinted ghost from md up.
                className="h-11 text-status-red hover:bg-status-red-dim hover:text-status-red md:h-9"
                onClick={() => setConfirmWithdraw(true)}
              >
                <IconTrash
                  className="size-5 md:size-4"
                  stroke={1.6}
                  aria-hidden
                />
                <Bi en="Delete this concern" hi="यह शिकायत हटाएँ" />
              </Button>
              <p className={cn("deva mt-1 text-text-3", T.caption)}>
                <Bi
                  en="It disappears for you and for the coordinators. This cannot be undone."
                  hi="यह आपके और कोऑर्डिनेटर दोनों के लिए हट जाएगी। इसे वापस नहीं लाया जा सकता।"
                />
              </p>
            </div>
          ) : null}
        </div>

        {/* ── the facts, as a rail from 1024 ──────────────────────────── */}
        <aside className="hidden w-80 shrink-0 lg:sticky lg:top-4 lg:block">
          <Facts payload={payload} locale={locale} />
        </aside>
      </div>

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
        titleHi="यह शिकायत हटाएँ?"
        descriptionEn="It will no longer appear anywhere, for you or for the coordinators. This cannot be undone."
        descriptionHi="यह कहीं नहीं दिखेगी — न आपको, न कोऑर्डिनेटर को। इसे वापस नहीं लाया जा सकता।"
        error={
          withdraw.isError ? (withdraw.error as Error).message : undefined
        }
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
              <Bi
                en={withdraw.isPending ? "Deleting…" : "Delete"}
                hi={withdraw.isPending ? undefined : "हटाएँ"}
              />
            </Button>
          </>
        }
      />
    </Shell>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * The measure.
 *
 * MODULE LEVEL, and that is not a style preference. Declared inside the screen
 * this would be a NEW component type on every render, so React would unmount
 * and remount the whole subtree on each keystroke and the comment box would
 * lose focus after one character. A component defined during render is never
 * the same component twice.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col">{children}</div>
  );
}

/**
 * The facts, as a two-column table rather than stacked pairs.
 *
 * Rendered TWICE — once inside the phone's `<details>` fold and once in the
 * 1024+ rail — from one definition, because what would drift between two
 * copies is the block an employee reads about their own complaint.
 */
function Facts({
  payload,
  locale,
}: {
  payload: ConcernDetailPayload;
  locale: "en" | "hi";
}) {
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
    <Panel className="p-3 sm:p-4">
      <h2 className={cn("deva mb-2 text-text-1", T.h3)}>
        Details
        <span className="deva hi"> (जानकारी)</span>
      </h2>

      <dl className="flex flex-col">
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
        <MetaRow labelEn="Department" labelHi="विभाग">
          {departmentOf(concern, locale)}
        </MetaRow>
        <MetaRow labelEn="Raised by" labelHi="दर्ज करने वाले">
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
        <MetaRow labelEn="Coordinator" labelHi="कोऑर्डिनेटर">
          <span className={cn(!concern.assignedToName && "text-text-3")}>
            {concern.assignedToName ?? (
              <Bi en="Not assigned yet" hi="अभी सौंपी नहीं गई" />
            )}
          </span>
        </MetaRow>
        <MetaRow labelEn="Created" labelHi="दर्ज">
          <span className="num">{absoluteTime(concern.createdAt, locale)}</span>
        </MetaRow>
        {concern.status !== "resolved" &&
        concern.status !== "closed" &&
        concern.slaDueAt ? (
          <MetaRow labelEn="Due" labelHi="नियत">
            <span
              className={cn("num", concern.isOverdue && "text-status-red")}
            >
              {absoluteTime(concern.slaDueAt, locale)}
            </span>
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
    </Panel>
  );
}

/** The same shape as the real page, so nothing jumps when it arrives. */
function DetailSkeleton() {
  return (
    <Shell>
      <div
        className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start lg:gap-8"
        aria-busy
        role="status"
      >
        <span className="sr-only">Loading concern</span>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Skeleton className="h-6 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24 rounded-pill" />
            <Skeleton className="h-5 w-20 rounded-pill" />
          </div>
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
        <div className="hidden w-80 shrink-0 lg:block">
          <Skeleton className="h-72 rounded-card" />
        </div>
      </div>
    </Shell>
  );
}
