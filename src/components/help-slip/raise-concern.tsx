"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconBulb,
  IconChevronLeft,
  IconCircleCheck,
  IconClipboardList,
  IconCloudOff,
  IconHistory,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

import { ConcernNumber } from "@/components/help-slip/concern-parts";
import {
  CheckboxField,
  FieldGrid,
  FormAlert,
  SelectField,
  SPAN_HALF,
  TextAreaField,
  TextField,
} from "@/components/help-slip/form-parts";
import {
  CARD_FOOTER_ROW,
  CountChip,
  PageHeader,
  SectionCard,
} from "@/components/help-slip/page-parts";
import { StickySubmitBar } from "@/components/help-slip/sticky-submit-bar";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Reveal } from "@/components/ui/reveal";
import { Spinner } from "@/components/ui/spinner";
import { PRIORITIES, type ConcernPriority } from "@/db/help-slip/schema";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { useHelpSlipSession } from "@/lib/help-slip/context";
import {
  clearDraft,
  draftKeyFor,
  hasContent,
  loadDraft,
  saveDraft,
  type ConcernDraft,
} from "@/lib/help-slip/draft";
import { relativeTime } from "@/lib/help-slip/format";
import { PRIORITY_META } from "@/lib/help-slip/meta";
import {
  MAX_SOLUTIONS,
  NAME_MAX,
  SOLUTION_MAX,
  TITLE_HARD_MAX,
  TITLE_SOFT_MAX,
  type DepartmentsPayload,
  type RaiseConcernResult,
} from "@/lib/help-slip/types";
import {
  raiseConcernSchema,
  type RaiseConcernInput,
} from "@/lib/help-slip/validation";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Raise a concern. The screen this app is judged on.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's
 * `src/features/concerns/screens/RaiseConcern.tsx`.
 *
 * Target: filled and submitted in UNDER SIXTY SECONDS, one-handed, standing on
 * a factory floor. Everything below follows from that, and most of it is about
 * the phone rather than about the form:
 *
 *  - **ONE SCREEN, no wizard.** A three-step form for six fields turns one
 *    60-second task into three 30-second ones with two chances to abandon.
 *    (One screen, not one column: on a desk the fields sit in the ERP's own
 *    grid — see the shape note below.)
 *  - **The submit bar tracks `window.visualViewport`.** `position: fixed`
 *    alone gets buried under the Android keyboard — see `StickySubmitBar`.
 *  - **`clientRequestId` is minted once per mount** and sent with every
 *    attempt. A phone on mobile data times out on requests the server actually
 *    processed; without this, a retry gives the coordinator two identical
 *    concerns.
 *  - **The draft is saved as you type**, so a phone call does not cost
 *    somebody the paragraph they just typed with one thumb.
 *  - **There is no description field.** Deliberately. What went wrong is one
 *    line; the paragraph belongs in a suggested solution, and a one-line box
 *    is what says so without a word of instruction.
 *
 * ── THE SHAPE: THIS IS AN ERP FORM ────────────────────────────────────────
 *
 * Modelled directly on `order-entry/orders/order-form.tsx`, because the
 * complaint this screen collected was that Help Slip "looks outdated" and the
 * measurement behind it was structural: the new-order form is bordered cards
 * of multi-column grids in a 1128px column; this was a 720px stack of naked
 * full-width inputs. So: three `SectionCard`s with accent icon chips, fields
 * in a `FieldGrid`, hints on the label row, and the ERP's fixed action bar at
 * the bottom on a desk. The phone keeps its own pinned bar, unchanged.
 *
 * ── PHOTO ATTACHMENTS ARE NOT HERE ────────────────────────────────────────
 *
 * The source compresses photos on the device and uploads them to Supabase
 * Storage AFTER the concern exists (the storage policy resolves the first path
 * segment back to a concern id and asks `can_read_concern()`). This shell has
 * no Supabase client at all — CLAUDE.md is explicit that it talks to plain
 * Postgres — so there is nothing to upload into and nothing to sign a URL
 * with.
 *
 * That gap is left OPEN rather than faked. No picker, no disabled button, no
 * "coming soon" row: a control that cannot work teaches people the feature is
 * broken, and a fake one teaches them their photo was sent when it was not.
 * When a storage client lands, the pieces to port are
 * `features/concerns/attachmentsApi.ts`, `components/AttachmentPicker.tsx`,
 * `components/PhotoLightbox.tsx`, and the "uploads continue behind the
 * confirmation" behaviour in `ConcernFiled.tsx`.
 */
export function RaiseConcern() {
  const session = useHelpSlipSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const formRef = React.useRef<HTMLFormElement>(null);

  /**
   * Minted ONCE per mount, and sent with every attempt.
   *
   * `useState` with an initialiser rather than `useRef(crypto.randomUUID())`,
   * because the ref form evaluates the expression on every render and throws
   * the extra uuids away — harmless here, wasteful, and misleading to read.
   */
  const [requestId] = React.useState(newRequestId);

  const [values, setValues] = React.useState<ConcernDraft>(() => ({
    departmentId: session.departmentId ?? "",
    filedForName: "",
    title: "",
    solutions: [""],
    priority: "normal",
    confidential: false,
  }));

  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitCount, setSubmitCount] = React.useState(0);
  const [filed, setFiled] = React.useState<RaiseConcernResult | null>(null);
  const [queued, setQueued] = React.useState(false);
  const [restorable, setRestorable] = React.useState<{
    values: ConcernDraft;
    savedAt: number;
  } | null>(null);

  const online = useOnline();
  const draftKey = React.useMemo(
    () => draftKeyFor(session.email),
    [session.email],
  );

  const set = React.useCallback(
    (patch: Partial<ConcernDraft>) =>
      setValues((prev) => ({ ...prev, ...patch })),
    [],
  );

  // ── departments ────────────────────────────────────────────────────────
  // A route of its own, because the failure matters: a failed fetch used to
  // render as a normal, enabled, EMPTY dropdown on a required field with
  // nothing on screen saying why.
  const departments = useQuery({
    queryKey: ["help-slip", "departments"],
    queryFn: () =>
      helpSlipGet<DepartmentsPayload>("/api/help-slip/departments"),
    staleTime: 10 * 60_000,
  });

  const departmentOptions = React.useMemo(
    () =>
      (departments.data?.departments ?? []).map((d) => ({
        value: d.id,
        // `name` only. `name_hi` stays in the database for the legacy app and
        // is never read here — this ERP is English-only.
        label: d.name,
      })),
    [departments.data],
  );

  /**
   * A department that no longer exists, cleared as soon as we can tell.
   *
   * `loadDepartments` returns ACTIVE ones only, and both a restored draft and
   * a profile default can name one that has since been switched off. Left
   * alone, that id sits in state looking chosen while the native select — with
   * no matching <option> — shows the placeholder, and the only thing that ever
   * says otherwise is the server's refusal after a submit. Clearing it makes
   * the control honest and turns the failure into the ordinary required-field
   * message.
   */
  React.useEffect(() => {
    const list = departments.data?.departments;
    if (!list || values.departmentId === "") return;
    if (!list.some((d) => d.id === values.departmentId)) {
      setValues((prev) => ({ ...prev, departmentId: "" }));
    }
  }, [departments.data, values.departmentId]);

  // ── draft: offered on mount, saved as you type ─────────────────────────

  React.useEffect(() => {
    const found = loadDraft(draftKey);
    if (found) setRestorable(found);
  }, [draftKey]);

  React.useEffect(() => {
    // Nothing is written once the concern is filed — the draft is cleared at
    // that point and re-saving it here would resurrect it a beat later.
    if (filed) return;
    if (!hasContent(values)) return;
    const timer = window.setTimeout(() => saveDraft(draftKey, values), 500);
    return () => window.clearTimeout(timer);
  }, [values, draftKey, filed]);

  // ── validation ─────────────────────────────────────────────────────────

  const parsed = raiseConcernSchema.safeParse({
    clientRequestId: requestId,
    departmentId: values.departmentId,
    filedForName: values.filedForName.trim() || undefined,
    title: values.title,
    solutions: values.solutions,
    priority: values.priority,
    confidential: values.confidential,
  });

  /** Every failing field, keyed the way the controls below are keyed. */
  const issues = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (parsed.success) return map;
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      // FIRST issue per field wins. Zod reports "too long" and "required"
      // together on a trimmed field and the second one is noise.
      if (!(key in map)) map[key] = issue.message;
    }
    return map;
    // `parsed` is recomputed every render; keying off its serialised issues
    // would be the same work twice.
  }, [parsed]);

  /**
   * Show an error only once the reader has LEFT the field, or once they have
   * tried to submit. Without the second condition the whole-schema run would
   * light up "suggest at least one way to fix it" the moment somebody blurs
   * the department select, having done nothing wrong.
   */
  const errorFor = (key: string): string | undefined => {
    if (key === "departmentId" && departments.isError) {
      return "Couldn't load departments. Check your connection and try again.";
    }
    if (!touched[key] && submitCount === 0) return undefined;
    const raw = issues[key];
    if (!raw) return undefined;
    // The employee whose PROFILE has no department gets a message that tells
    // them what to do about it, rather than the generic "choose a department"
    // that assumes they simply skipped a step.
    if (key === "departmentId" && !session.departmentId) {
      return "Your profile has no department yet. Pick the one this is about, or ask your admin.";
    }
    return raw;
  };

  const blur = (key: string) => setTouched((t) => ({ ...t, [key]: true }));

  // Field order IS the visual order — the summary and the focus jump both
  // depend on it, and a list that drifts from the DOM would send somebody to
  // the wrong field.
  const order: { id: string; key: string; label: string }[] = [
    { id: "raise-department", key: "departmentId", label: "Department" },
    { id: "raise-title", key: "title", label: "What's the problem?" },
    ...values.solutions.map((_s, i) => ({
      id: `raise-solution-${i + 1}`,
      key: `solutions.${i}`,
      label: solutionLabel(i),
    })),
  ];

  const problems = order
    .map((f) => ({ ...f, error: errorFor(f.key) }))
    .filter((f): f is typeof f & { error: string } => Boolean(f.error));

  function focusField(id: string) {
    const el = formRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(id)}`,
    );
    if (!el) return;
    // Centre it rather than letting focus() scroll it to whatever edge it
    // likes: a field flush to the bottom of the viewport sits under the
    // keyboard.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
    el.focus({ preventScroll: true });
  }

  // ── submit ─────────────────────────────────────────────────────────────

  const submit = useMutation({
    mutationFn: (input: RaiseConcernInput) =>
      helpSlipSend<RaiseConcernResult>(
        "/api/help-slip/concerns",
        "POST",
        input,
      ),
    onSuccess: (result) => {
      clearDraft(draftKey);
      setQueued(false);
      setFiled(result);
      // The dashboards and both lists all move when a concern is filed.
      void queryClient.invalidateQueries({ queryKey: ["help-slip"] });
    },
  });

  const busy = submit.isPending || queued;

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitCount((n) => n + 1);
    if (busy || filed) return;

    if (!parsed.success) {
      const first = order.find((f) => issues[f.key]) ?? order[0];
      if (first) focusField(first.id);
      return;
    }

    if (!online) {
      // Queued, not failed. The draft is already saved, and the effect below
      // fires the moment the browser says we are back.
      setQueued(true);
      return;
    }

    submit.mutate(parsed.data);
  };

  // Retry on reconnect, once, without asking.
  const readyToFlush = online && queued && !filed && !submit.isPending;
  React.useEffect(() => {
    if (!readyToFlush) return;
    if (!parsed.success) return;
    submit.mutate(parsed.data);
    // Fires on the transition into "online and queued" only — depending on
    // `parsed` would re-fire on every keystroke while a send is queued.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToFlush]);

  // ── the submit control, rendered twice (in the flow, and pinned) ───────

  const submitButton = (
    <Button
      type="submit"
      form="raise-form"
      size="lg"
      // Disabled on the first click, and it stays disabled until the server
      // answers. The request id is the real guard — this is the one that stops
      // the double tap ever leaving the phone.
      disabled={busy || filed !== null}
      // 44px + 16px text below md: the minimum touch target for a phone held
      // on the factory floor, and anything under 16px makes iOS Safari
      // auto-zoom on focus and never zoom back out. ERP-compact (36px / 13px)
      // from md up. The height BELOW md is load-bearing twice over — the
      // StickySubmitBar's h-20 spacer is sized to it.
      className="h-11 w-full px-5 text-base md:h-9 md:w-auto md:px-3 md:text-sm"
    >
      {submit.isPending ? <Spinner /> : null}
      {submit.isPending ? "Sending…" : "Submit concern"}
    </Button>
  );

  return (
    /*
      1120px, centred, and the SAME width on the heading and on every card —
      the ERP form pattern (order-form.tsx puts one `mx-auto w-full max-w-[…]`
      on both, or the title floats left of its own cards).

      Why 1120 and not this screen's old 720: at 1440px the Order Entry
      new-order form gets 1440 − 264 sidebar − 48 page padding = 1128px of
      content, so 1120 makes the two forms read at the same width on the same
      monitor and stops the wider desks stretching six fields across 1500px.
      The reading width that a 720px column was protecting belongs to prose,
      and there is none here: every line is a label, a control or one clause.
    */
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 md:pb-24">
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
          My concerns
        </Link>

        <PageHeader
          titleEn="Raise a concern"
          subtitle={`Filing as ${session.fullName}`}
        />
      </Reveal>

      {/* ── offline: a banner, never a block ────────────────────────────── */}
      {!online ? (
        <FormAlert tone="neutral" role="status">
          <IconCloudOff
            className="mt-[1px] size-4 shrink-0 text-text-3"
            stroke={1.6}
            aria-hidden
          />
          <span className="flex-1">
            You&apos;re offline. Your draft is saved.
          </span>
        </FormAlert>
      ) : null}

      {queued ? (
        <FormAlert tone="neutral" role="status">
          Saved. We&apos;ll send it the moment you&apos;re back online.
        </FormAlert>
      ) : null}

      {/* ── the draft: OFFERED, never forced ────────────────────────────── */}
      {restorable ? (
        <SectionCard title="Restore your draft?" icon={<IconHistory />}>
          <p className={cn("text-text-3", T.bodySm)}>
            You started this{" "}
            <span className="num">
              {relativeTime(new Date(restorable.savedAt).toISOString())}
            </span>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              onClick={() => {
                setValues(restorable.values);
                setRestorable(null);
              }}
            >
              Restore
            </Button>
            <Button
              type="button"
              variant="ghost"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              onClick={() => {
                clearDraft(draftKey);
                setRestorable(null);
              }}
            >
              Start fresh
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <form
        id="raise-form"
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        // gap-3 between sibling cards inside one region — the ERP's ladder
        // (gap-5 page root, gap-3 card to card).
        className="flex flex-col gap-3"
      >
        {/* ── the summary, only once there are 2+ things to fix ─────────── */}
        {problems.length >= 2 ? (
          <FormAlert>
            <IconAlertTriangle
              className="mt-[1px] size-4 shrink-0"
              stroke={1.6}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Fix {problems.length} things before submitting
              </p>
              {/* No gap below `md`: each row is a 44px target there, so any
                  space between them would read as separate blocks rather than
                  one list. The ERP's list spacing returns from `md`. */}
              <ul className="mt-2 flex flex-col md:gap-1">
                {problems.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`#${f.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        focusField(f.id);
                      }}
                      // These links are the only way back to the field that
                      // failed, on the one screen filled standing up: 44px
                      // below md (factory-floor touch target), the ERP's own
                      // line height at md+. Weight and rule are unchanged.
                      className="flex min-h-11 items-center underline underline-offset-2 md:min-h-0"
                    >
                      {f.label} — {f.error}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </FormAlert>
        ) : null}

        <Reveal index={1}>
          <SectionCard title="Concern details" icon={<IconClipboardList />}>
            {/*
              Two columns from `sm`, one below it. Two, not the default three:
              there are only three fields here, and a third empty track beside
              Name and Department reads as a rendering fault rather than as
              air.
            */}
            <FieldGrid cols={2}>
              {/*
                The Name line from the paper slip, FIRST because that is the
                order it is printed in.

                EMPTY by default, deliberately. Pre-filled with the signed-in
                person's own name it read as a broken input: a box you cannot
                meaningfully change, answering a question you did not ask.
                Blank, it asks something real — who is this for — and the hint
                says what happens if you skip it.

                It is free text and it is NOT identity: `raise_concern` takes
                the filer from `auth.uid()` inside the database either way.
              */}
              <TextField
                id="raise-name"
                labelEn="Name"
                helperEn="Leave blank to use your own."
                value={values.filedForName}
                onChange={(v) => set({ filedForName: v })}
                onBlur={() => blur("filedForName")}
                error={errorFor("filedForName")}
                maxLength={NAME_MAX}
                autoCapitalize="words"
                enterKeyHint="next"
                disabled={busy}
              />

              <div className="flex min-w-0 flex-col gap-1">
                <SelectField
                  id="raise-department"
                  labelEn="Department"
                  helperEn="Change it if it's not yours."
                  placeholder="Choose a department"
                  options={departmentOptions}
                  value={values.departmentId}
                  onChange={(v) => set({ departmentId: v })}
                  onBlur={() => blur("departmentId")}
                  error={errorFor("departmentId")}
                  required
                  disabled={departments.isPending || busy}
                />
                {departments.isError ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // 44px below md (factory-floor touch target); ERP 36px at
                    // md+. `size="sm"` alone is 28px and unhittable on a phone.
                    className="h-11 self-start md:h-9"
                    onClick={() => void departments.refetch()}
                  >
                    Try again
                  </Button>
                ) : null}
              </div>

              {/*
                An Input, not a Textarea, and that is the whole design of this
                screen in one control: the paragraph belongs in a suggested
                solution, and a one-line box says so without a word of
                instruction. There is no description field.

                SPAN_HALF is two tracks — on this two-column grid that is the
                whole row, which is what a sentence-long question wants.
              */}
              <TextField
                id="raise-title"
                className={SPAN_HALF}
                labelEn="What's the problem?"
                helperEn="One line."
                value={values.title}
                onChange={(v) => set({ title: v })}
                onBlur={() => blur("title")}
                error={errorFor("title")}
                required
                softMax={TITLE_SOFT_MAX}
                maxLength={TITLE_HARD_MAX}
                autoCapitalize="sentences"
                enterKeyHint="next"
                disabled={busy}
              />
            </FieldGrid>
          </SectionCard>
        </Reveal>

        {/* ══════════════════════════════════════════════════════════════════
            THE SUGGESTED SOLUTIONS.

            The one raised section this form is allowed. It is the reason the
            paper process worked and the reason this is not a helpdesk, so it
            gets the ERP's EMPHASISED card (border-border-strong + shadow-sm,
            §B.1) rather than the hairline every other section gets — the same
            weight order-form gives a fabric block.
           ══════════════════════════════════════════════════════════════════ */}
        <Reveal index={2}>
          <SectionCard
            title="Your suggested solutions"
            icon={<IconBulb />}
            aside={
              <CountChip>
                {values.solutions.length}/{MAX_SOLUTIONS}
              </CountChip>
            }
            className="border-border-strong shadow-sm"
          >
            <p className={cn("text-text-3", T.bodySm)}>
              Like the help slip — tell us how you think it can be fixed.
            </p>

            {/* A column, not a grid: a solution is a paragraph, so every one
                of these takes the whole row by definition. */}
            <div className="flex flex-col gap-2">
              {values.solutions.map((body, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <TextAreaField
                      id={`raise-solution-${index + 1}`}
                      labelEn={SOLUTION_LABELS[index] ?? ""}
                      // Only the first is required — see the superRefine note
                      // in validation.ts. The other two are an invitation, not
                      // a demand.
                      required={index === 0}
                      rows={2}
                      maxLength={SOLUTION_MAX}
                      value={body}
                      onChange={(v) =>
                        set({
                          solutions: values.solutions.map((s, i) =>
                            i === index ? v : s,
                          ),
                        })
                      }
                      onBlur={() => blur(`solutions.${index}`)}
                      error={errorFor(`solutions.${index}`)}
                      disabled={busy}
                    />
                  </div>

                  {index > 0 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        set({
                          solutions: values.solutions.filter(
                            (_s, i) => i !== index,
                          ),
                        })
                      }
                      aria-label={`Remove ${SOLUTION_LABELS[index] ?? ""}`}
                      // The offset clears the label line so the X sits beside
                      // the box rather than beside the words above it. It is
                      // re-derived for the English-only scale: a 13px label at
                      // the document's 1.5 line-height is 19.5px (the hint now
                      // shares that row and adds no height), plus Field's
                      // gap-[7px] = 26.5px. It was 28px back when the label
                      // line box was 1.65 rather than 1.5.
                      //
                      // 44px below md: the minimum touch target for a phone
                      // held on the factory floor. The ERP's 36px destructive
                      // icon button from md up.
                      className="mt-[26.5px] grid size-11 shrink-0 cursor-pointer place-items-center rounded-field text-text-3 outline-none transition-colors hover:bg-status-red-dim hover:text-status-red focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40 md:size-9"
                    >
                      <IconX
                        className="size-5 md:size-4"
                        stroke={1.6}
                        aria-hidden
                      />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {/* The ERP's dashed card-footer rule: controls that act on THIS
                card, visibly distinct from the solid rule that separates
                content. The button is an invitation, not an action on the
                form — ghost, because the one primary CTA is Submit.

                `mt-0` because the literal carries `mt-3` for a card that
                stacks with margins; this one is a flex column and its own
                `gap-3` already supplies that 12px. */}
            <div className={cn(CARD_FOOTER_ROW, "mt-0")}>
              <p className={cn("text-text-3", T.caption)}>
                Up to <span className="num">{MAX_SOLUTIONS}</span>. Only the
                first is required.
              </p>
              {values.solutions.length < MAX_SOLUTIONS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => set({ solutions: [...values.solutions, ""] })}
                  // 44px below md (factory-floor touch target); ERP 36px at
                  // md+. `size="sm"` alone is 28px — unhittable standing up,
                  // and this was measured at 28px on a 390px phone.
                  className="h-11 shrink-0 md:h-9"
                >
                  <IconPlus className="size-4" stroke={1.6} aria-hidden />
                  Add another solution
                </Button>
              ) : null}
            </div>
          </SectionCard>
        </Reveal>

        {/* ── how it is handled ─────────────────────────────────────────── */}
        <Reveal index={3}>
          <SectionCard title="How it's handled" icon={<IconAdjustments />}>
            <FieldGrid cols={2}>
              <PriorityField
                value={values.priority}
                onChange={(p) => set({ priority: p })}
                disabled={busy}
              />

              {/*
                D4. A permission, so it does not sit in the column looking like
                one more ordinary field — it gets a label line of its own and
                its own recessed ground, so the pair reads as two parallel
                questions ("how urgent", "who can see it").
              */}
              <div className="flex min-w-0 flex-col gap-2">
                <span className={cn("text-text-2", T.label)}>
                  Who can see it?
                </span>
                <div className="rounded-field border border-border bg-surface-2 px-3 py-2">
                  <CheckboxField
                    id="raise-confidential"
                    checked={values.confidential}
                    onChange={(v) => set({ confidential: v })}
                    labelEn="Confidential"
                    descriptionEn="Only admins and coordinators with confidential access can open it — that may not include your own coordinator."
                    disabled={busy}
                  />
                </div>
              </div>
            </FieldGrid>
          </SectionCard>
        </Reveal>

        {submit.isError ? (
          <FormAlert>{(submit.error as Error).message}</FormAlert>
        ) : null}

        {/*
          The DESKTOP action bar, pinned — the same ending order-form.tsx has,
          so the two forms finish the same way. `md:left-[264px]` clears the
          shell sidebar, which is `w-[264px]` and hidden below the same `md`.

          Surface, not the page ground: a translucent `bg-surface/95` over a
          blur with a hairline top border, so the cards stay faintly visible
          under it and the bar still reads as a solid object. The root's
          `md:pb-24` (96px ≈ the bar's 69px plus a card gap) is what keeps the
          last card reachable above it.

          Below md this is hidden and the phone's `StickySubmitBar` takes over
          — that one also tracks the Android keyboard, which this does not need
          to.
        */}
        <div className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-[6px] sm:px-[34px] sm:py-4 md:left-[264px] md:block">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
          />
          <div className="mx-auto flex w-full max-w-[1120px] items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              // 44px below md (factory-floor touch target); ERP 36px at md+.
              className="h-11 md:h-9"
              onClick={() => router.push("/help-slip/concerns")}
            >
              Cancel
            </Button>
            {submitButton}
          </div>
        </div>
      </form>

      {/* Phone only. Dodges the Android keyboard and keeps Submit reachable
          without scrolling to the end of the form. */}
      <StickySubmitBar>{submitButton}</StickySubmitBar>

      <ConcernFiled
        result={filed}
        onTrack={() => {
          if (filed) router.push(`/help-slip/concerns/${filed.concernId}`);
        }}
        onHome={() => router.push("/help-slip")}
      />
    </div>
  );
}

// ─── priority ──────────────────────────────────────────────────────────────

/**
 * Four options, as a real radiogroup — 44px on a phone, ERP-compact above it.
 *
 * NOT `<Segmented>`: that control is single-select with a roving tabindex and
 * this is a real `radiogroup` with its own arrow-key `move()`. Only the
 * GEOMETRY converged — from md up these carry `ui/segmented.tsx`'s md size
 * (h-8 / px-3 / 13px), so the form reads like the rest of the ERP on a desk.
 * Below md they stay 44px with 16px text, because this is the one screen in
 * the module filled one-handed while standing up, and that is the touch
 * minimum this module's `CONTROL` constant exists to enforce.
 *
 * Content-sized rather than full-bleed: four labels come to well under the
 * 328px a 360px phone leaves after the shell's gutters, and they wrap to two
 * rows rather than shrinking when the grid column is narrow.
 */
function PriorityField({
  value,
  onChange,
  disabled,
}: {
  value: ConcernPriority;
  onChange: (next: ConcernPriority) => void;
  disabled?: boolean;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const n = PRIORITIES.length;
    const next = (from + delta + n) % n;
    onChange(PRIORITIES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id="raise-priority-label" className={cn("text-text-2", T.label)}>
        How urgent is it?
      </span>

      <div
        role="radiogroup"
        aria-labelledby="raise-priority-label"
        className="flex flex-wrap gap-2"
      >
        {PRIORITIES.map((p, i) => {
          const meta = PRIORITY_META[p];
          const selected = p === value;
          return (
            <button
              key={p}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(p)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className={cn(
                // 44px + 16px text below md (see this component's note above);
                // ui/segmented.tsx's md geometry from md up.
                "h-11 min-w-[76px] cursor-pointer rounded-field border px-4 text-base font-medium transition-colors outline-none md:h-8 md:min-w-[64px] md:px-3 md:text-[13px]",
                "focus-visible:ring-3 focus-visible:ring-ring/40",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary bg-accent text-accent-text"
                  : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text-1",
              )}
            >
              {meta.labelEn}
            </button>
          );
        })}
      </div>

      {/* The single line that prevents urgency inflation. Everything is urgent
          to the person reporting it; this says what the word costs everyone
          else. */}
      <p className={cn("text-text-3", T.caption)}>
        Urgent is for work stoppages only.
      </p>
    </div>
  );
}

// ─── the confirmation ──────────────────────────────────────────────────────

/**
 * Filed. A CONFIRMATION OVER THE FORM, not a screen instead of it.
 *
 * The three reasons this is not a toast decide its shape:
 *
 *  1. It must not disappear. The concern number is the only handle this person
 *     has on what they just reported, and a number that vanishes after four
 *     seconds is a number nobody wrote down.
 *  2. It must be readable on a factory floor — not small, not low-contrast,
 *     not at the edge of the screen.
 *  3. It must be unambiguous that the thing was SENT. People submit twice
 *     otherwise.
 *
 * Hence PERSISTENT: no outside press, no Escape, no X. The two buttons are the
 * only ways out, and both of them leave — the form behind this one is spent.
 * A confirmation you can dismiss with a stray tap, on a phone, one-handed, is
 * a confirmation nobody read.
 */
function ConcernFiled({
  result,
  onTrack,
  onHome,
}: {
  result: RaiseConcernResult | null;
  onTrack: () => void;
  onHome: () => void;
}) {
  return (
    <Dialog
      open={result !== null}
      // Every route out — the backdrop, Escape, the swipe — arrives here as a
      // close request, and every one of them is ignored. `open` is controlled
      // by `filed`, which only the two buttons below change.
      onOpenChange={() => undefined}
      disablePointerDismissal
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={T.h3}>Concern filed</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <IconCircleCheck
            className="size-10 text-status-green"
            stroke={1.5}
            aria-hidden
          />

          <ConcernNumber value={result?.concernNumber ?? ""} size="lg" />

          <p className={cn("text-text-2", T.bodySm)}>
            We&apos;ll notify you when there&apos;s an update.
          </p>

          {/* An idempotent retry landed on a concern that already existed.
              Said out loud, because "filed" would otherwise read as a second
              one and somebody would go looking for the duplicate. */}
          {result && !result.created ? (
            <p className={cn("text-text-3", T.caption)}>
              This was already filed — we&apos;ve matched it to the one you
              sent.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            // 44px below md (factory-floor touch target); ERP 36px at md+.
            className="h-11 md:h-9"
            onClick={onHome}
          >
            Back to home
          </Button>
          <Button type="button" className="h-11 md:h-9" onClick={onTrack}>
            Track this concern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── odds and ends ─────────────────────────────────────────────────────────

/**
 * "1st / 2nd / 3rd solution", as they appear on the slip. English ordinals are
 * irregular, so they are written out rather than built from an index.
 */
const SOLUTION_LABELS: string[] = [
  "1st solution",
  "2nd solution",
  "3rd solution",
];

function solutionLabel(index: number): string {
  return SOLUTION_LABELS[index] ?? "";
}

/**
 * A v4 uuid, with a fallback.
 *
 * `crypto.randomUUID` needs a secure context and is missing from a few older
 * Android webviews. The schema demands a uuid, so a browser without it would
 * fail validation on a field the person cannot see or fix — which is the worst
 * possible refusal. `getRandomValues` is far more widely available; the last
 * resort is not cryptographically anything, and does not need to be: this is a
 * de-duplication key, not a secret.
 */
function newRequestId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Online, as the browser understands it.
 *
 * `navigator.onLine` is a weak signal — it reports the network interface, not
 * whether anything is reachable — which is exactly why the offline branch here
 * QUEUES rather than blocks: the draft is already saved, the request is sent
 * the moment the event fires, and a false negative costs one tap.
 *
 * `useSyncExternalStore` rather than an effect, so the first render already
 * has the right answer and the server render says "online" (the neutral
 * answer, and the only one it can know).
 */
function useOnline(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
