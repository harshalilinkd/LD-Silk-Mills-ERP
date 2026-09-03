"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronLeft,
  IconCircleCheck,
  IconCloudOff,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
import { ConcernNumber } from "@/components/help-slip/concern-parts";
import {
  CheckboxField,
  FormAlert,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/help-slip/form-parts";
import { PageHeader, Panel } from "@/components/help-slip/page-parts";
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
import { useHelpSlipLocale, useHelpSlipSession } from "@/lib/help-slip/context";
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
 *  - **ONE column, no wizard.** A three-step form for six fields turns one
 *    60-second task into three 30-second ones with two chances to abandon.
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
  const locale = useHelpSlipLocale();
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
    queryFn: () => helpSlipGet<DepartmentsPayload>("/api/help-slip/departments"),
    staleTime: 10 * 60_000,
  });

  const departmentOptions = React.useMemo(
    () =>
      (departments.data?.departments ?? []).map((d) => ({
        value: d.id,
        // Inline `English (हिंदी)`, the same rule `<Bi>` applies everywhere
        // else — a native <option> cannot hold two spans, so the parenthetical
        // is built into the string.
        label: d.nameHi ? `${d.name} (${d.nameHi})` : d.name,
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
    { id: "raise-department", key: "departmentId", label: "Department (विभाग)" },
    { id: "raise-title", key: "title", label: "What's the problem? (प्रॉब्लेम)" },
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
    const el = formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;
    // Centre it rather than letting focus() scroll it to whatever edge it
    // likes: a field flush to the bottom of the viewport sits under the
    // keyboard.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
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
      className="h-11 w-full px-5 text-base md:w-auto"
    >
      {submit.isPending ? <Spinner /> : null}
      <Bi
        en={submit.isPending ? "Sending…" : "Submit concern"}
        hi={submit.isPending ? undefined : "जमा करें"}
      />
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col">
      <Reveal index={0}>
        <Link
          href="/help-slip/concerns"
          className={cn(
            "-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-text-3 transition-colors hover:text-text-1",
            T.bodySm,
          )}
        >
          <IconChevronLeft className="size-4" stroke={1.6} aria-hidden />
          <Bi en="My concerns" hi="मेरी शिकायतें" />
        </Link>

        <PageHeader
          titleEn="Raise a concern"
          titleHi="शिकायत दर्ज करें"
          subtitle={
            <Bi
              en={`Filing as ${session.fullName}`}
              hi={`${session.fullName} के रूप में दर्ज`}
            />
          }
        />
      </Reveal>

      <div className="flex flex-col gap-4 pb-10">
        {/* ── offline: a banner, never a block ──────────────────────────── */}
        {!online ? (
          <Reveal index={1}>
            <FormAlert tone="neutral" role="status">
              <span className="flex items-start gap-2">
                <IconCloudOff
                  className="mt-0.5 size-5 shrink-0 text-text-3"
                  stroke={1.6}
                  aria-hidden
                />
                <Bi
                  en="You're offline. Your draft is saved."
                  hi="आप ऑफ़लाइन हैं। आपका ड्राफ़्ट सेव है।"
                />
              </span>
            </FormAlert>
          </Reveal>
        ) : null}

        {queued ? (
          <FormAlert tone="neutral" role="status">
            <Bi
              en="Saved. We'll send it the moment you're back online."
              hi="सेव हो गया। कनेक्शन आते ही भेज देंगे।"
            />
          </FormAlert>
        ) : null}

        {/* ── the draft: OFFERED, never forced ──────────────────────────── */}
        {restorable ? (
          <Panel className="flex flex-col gap-2 p-4">
            <div>
              <p className={cn("deva text-text-1", T.label)}>
                <Bi en="Restore your draft?" hi="अपना ड्राफ़्ट वापस लाएँ?" />
              </p>
              <p className={cn("deva text-text-3", T.caption)}>
                <Bi
                  en={`You started this ${relativeTime(new Date(restorable.savedAt).toISOString(), "en")}.`}
                  hi={`आपने इसे ${relativeTime(new Date(restorable.savedAt).toISOString(), "hi")} शुरू किया था।`}
                />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  setValues(restorable.values);
                  setRestorable(null);
                }}
              >
                <Bi en="Restore" hi="वापस लाएँ" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => {
                  clearDraft(draftKey);
                  setRestorable(null);
                }}
              >
                <Bi en="Start fresh" hi="नया शुरू करें" />
              </Button>
            </div>
          </Panel>
        ) : null}

        <Reveal index={2}>
          <form
            id="raise-form"
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            className="flex flex-col gap-5"
          >
            {/* ── the summary, only once there are 2+ things to fix ─────── */}
            {problems.length >= 2 ? (
              <FormAlert>
                <p className="deva font-semibold">
                  <Bi
                    en={`Fix ${problems.length} things before submitting`}
                    hi={`जमा करने से पहले ${problems.length} चीज़ें ठीक करें`}
                  />
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {problems.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`#${f.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          focusField(f.id);
                        }}
                        className="deva underline underline-offset-2"
                      >
                        {f.label} — {f.error}
                      </a>
                    </li>
                  ))}
                </ul>
              </FormAlert>
            ) : null}

            {/*
              The Name line from the paper slip, FIRST because that is the
              order it is printed in.

              EMPTY by default, deliberately. Pre-filled with the signed-in
              person's own name it read as a broken input: a box you cannot
              meaningfully change, answering a question you did not ask. Blank,
              it asks something real — who is this for — and the helper says
              what happens if you skip it.

              It is free text and it is NOT identity: `raise_concern` takes the
              filer from `auth.uid()` inside the database either way.
            */}
            <TextField
              id="raise-name"
              labelEn="Name"
              labelHi="नाम"
              helperEn="Who it's for. Leave blank to file under your name."
              helperHi="यह किसके लिए है। खाली छोड़ें तो आपके नाम से।"
              value={values.filedForName}
              onChange={(v) => set({ filedForName: v })}
              onBlur={() => blur("filedForName")}
              error={errorFor("filedForName")}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              enterKeyHint="next"
              disabled={busy}
            />

            <div className="flex flex-col gap-1">
              <SelectField
                id="raise-department"
                labelEn="Department"
                labelHi="विभाग"
                helperEn="Change it if this is about another department."
                helperHi="अगर यह किसी और विभाग की बात है तो बदल दें।"
                placeholder="Choose a department (विभाग चुनें)"
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
                  className="self-start"
                  onClick={() => void departments.refetch()}
                >
                  <Bi en="Try again" hi="दोबारा कोशिश करें" />
                </Button>
              ) : null}
            </div>

            {/*
              An Input, not a Textarea, and that is the whole design of this
              screen in one control: the paragraph belongs in a suggested
              solution, and a one-line box says so without a word of
              instruction. There is no description field.
            */}
            <TextField
              id="raise-title"
              labelEn="What's the problem?"
              labelHi="प्रॉब्लेम"
              helperEn="One line. Your solutions go below."
              helperHi="एक लाइन में। आपके समाधान नीचे लिखें।"
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

            {/* ══════════════════════════════════════════════════════════════
                THE SUGGESTED SOLUTIONS.

                The one raised section this form is allowed. It is the reason
                the paper process worked and the reason this is not a
                helpdesk, so it sits on its own plane rather than reading as
                fields four to six.
               ══════════════════════════════════════════════════════════════ */}
            <Panel className="flex flex-col gap-3 p-4 md:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <h2 className={cn("deva text-text-1", T.h3)}>
                    Your suggested solutions
                    <span className="deva hi"> (आपके सुझाए समाधान)</span>
                  </h2>
                  <p className={cn("deva mt-0.5 text-text-3", T.caption)}>
                    <Bi
                      en="Like the help slip — tell us how you think it can be fixed."
                      hi="हेल्प स्लिप की तरह — बताइए कि इसे कैसे ठीक किया जा सकता है।"
                    />
                  </p>
                </div>

                {/* An invitation, not an action on the form. Ghost, because it
                    competes with nothing — the one primary CTA is Submit. */}
                {values.solutions.length < MAX_SOLUTIONS ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      set({ solutions: [...values.solutions, ""] })
                    }
                    className="shrink-0"
                  >
                    <IconPlus className="size-4" stroke={1.6} aria-hidden />
                    <Bi en="Add another solution" hi="एक और समाधान जोड़ें" />
                  </Button>
                ) : null}
              </div>

              {values.solutions.map((body, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <TextAreaField
                      id={`raise-solution-${index + 1}`}
                      labelEn={SOLUTION_LABELS[index]?.en ?? ""}
                      labelHi={SOLUTION_LABELS[index]?.hi ?? ""}
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
                      aria-label={`Remove ${SOLUTION_LABELS[index]?.en ?? ""}`}
                      // mt-7 clears the label line so the X sits beside the box
                      // rather than beside the words above it.
                      className="mt-7 grid size-11 shrink-0 cursor-pointer place-items-center rounded-field text-text-3 outline-none transition-colors hover:bg-chip hover:text-text-1 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <IconX className="size-5" stroke={1.6} aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
            </Panel>

            {/* ── how it is handled ────────────────────────────────────── */}
            <PriorityField
              value={values.priority}
              onChange={(p) => set({ priority: p })}
              locale={locale}
              disabled={busy}
            />

            {/*
              D4. A permission, so it does not sit in the column looking like
              one more ordinary field — it gets a label line of its own and its
              own ground, so the pair above and below reads as two parallel
              questions ("how urgent", "who can see it").
            */}
            <div className="flex flex-col gap-2">
              <span className={cn("deva text-text-1", T.label)}>
                Who can see it?
                <span className="deva hi"> (कौन देख सकता है?)</span>
              </span>
              <div className="rounded-field border border-border bg-surface-2 px-3 py-2">
                <CheckboxField
                  id="raise-confidential"
                  checked={values.confidential}
                  onChange={(v) => set({ confidential: v })}
                  labelEn="Confidential"
                  labelHi="गोपनीय"
                  descriptionEn="Only admins and coordinators with confidential access can open it — that may not include your own coordinator."
                  descriptionHi="इसे सिर्फ़ एडमिन और गोपनीय पहुँच वाले कोऑर्डिनेटर खोल सकते हैं — इसमें आपके अपने कोऑर्डिनेटर शामिल हों या न हों।"
                  disabled={busy}
                />
              </div>
            </div>

            {submit.isError ? (
              <FormAlert>{(submit.error as Error).message}</FormAlert>
            ) : null}

            {/* The desktop submit. Its phone equivalent is the pinned bar
                below, which is why this one is hidden under 768. */}
            <div className="hidden md:flex md:items-center md:gap-3">
              {submitButton}
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => router.push("/help-slip/concerns")}
              >
                <Bi en="Cancel" hi="रद्द करें" />
              </Button>
            </div>
          </form>
        </Reveal>
      </div>

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
 * Four options, as a real radiogroup at 44px.
 *
 * NOT `<Segmented>`: the shell's segmented control is 28–32px, which is right
 * for a filter chip above a table and wrong for a form control on the one
 * screen in this module that is filled one-handed while standing up. 44px is
 * the touch minimum this module's `CONTROL` constant exists to enforce, and
 * the reason it exists is exactly this form.
 *
 * Content-sized rather than full-bleed: four labels come to well under the
 * 328px a 360px phone leaves after the shell's gutters.
 */
function PriorityField({
  value,
  onChange,
  locale,
  disabled,
}: {
  value: ConcernPriority;
  onChange: (next: ConcernPriority) => void;
  locale: "en" | "hi";
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
    <div className="flex flex-col gap-2">
      <span id="raise-priority-label" className={cn("deva text-text-1", T.label)}>
        How urgent is it?
        <span className="deva hi"> (कितना ज़रूरी है?)</span>
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
                "deva h-11 min-w-[76px] cursor-pointer rounded-field border px-4 text-base font-medium transition-colors outline-none",
                "focus-visible:ring-3 focus-visible:ring-ring/40",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary bg-accent text-accent-text"
                  : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text-1",
              )}
            >
              {locale === "hi" ? meta.labelHi : meta.labelEn}
            </button>
          );
        })}
      </div>

      {/* The single line that prevents urgency inflation. Everything is urgent
          to the person reporting it; this says what the word costs everyone
          else. */}
      <p className={cn("deva text-text-3", T.caption)}>
        <Bi
          en="Urgent is for work stoppages only."
          hi="अर्जेंट सिर्फ़ तब जब काम रुक गया हो।"
        />
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
          <DialogTitle className={cn("deva", T.h3)}>
            <Bi en="Concern filed" hi="शिकायत दर्ज हो गई" />
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <IconCircleCheck
            className="size-12 text-status-green"
            stroke={1.5}
            aria-hidden
          />

          <ConcernNumber value={result?.concernNumber ?? ""} size="lg" />

          {/* Both languages, always, in both locales. This is the one sentence
              every employee has to be able to read. */}
          <div>
            <p className={cn("deva text-text-2", T.bodySm)}>
              We&apos;ll notify you when there&apos;s an update.
            </p>
            <p className={cn("deva text-text-3", T.caption)}>
              अपडेट आते ही आपको बताया जाएगा।
            </p>
          </div>

          {/* An idempotent retry landed on a concern that already existed.
              Said out loud, because "filed" would otherwise read as a second
              one and somebody would go looking for the duplicate. */}
          {result && !result.created ? (
            <p className={cn("deva text-text-3", T.caption)}>
              <Bi
                en="This was already filed — we've matched it to the one you sent."
                hi="यह पहले ही दर्ज हो चुकी थी — वही शिकायत दिखाई जा रही है।"
              />
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={onHome}
          >
            <Bi en="Back to home" hi="होम पर जाएँ" />
          </Button>
          <Button type="button" className="h-11" onClick={onTrack}>
            <Bi en="Track this concern" hi="शिकायत देखें" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── odds and ends ─────────────────────────────────────────────────────────

/**
 * "1st / 2nd / 3rd solution", in both languages, as they appear on the slip.
 * Ordinals are irregular in English and are separate words in Hindi, so they
 * are written out rather than built from an index.
 */
const SOLUTION_LABELS: { en: string; hi: string }[] = [
  { en: "1st solution", hi: "पहला समाधान" },
  { en: "2nd solution", hi: "दूसरा समाधान" },
  { en: "3rd solution", hi: "तीसरा समाधान" },
];

function solutionLabel(index: number): string {
  const l = SOLUTION_LABELS[index];
  return l ? `${l.en} (${l.hi})` : "";
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
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
