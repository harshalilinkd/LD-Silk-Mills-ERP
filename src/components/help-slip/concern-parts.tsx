"use client";

import * as React from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconLock,
} from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { absoluteTime } from "@/lib/help-slip/format";
import type { ConcernSolutionRow } from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The pieces the concern DETAIL and the coordinator WORKSPACE both draw.
 *
 * Written once and rendered in two places rather than forked, for the reason
 * the source states about `ResponsiveList`: two copies drift within a month,
 * and what would drift here is the block an employee reads about their own
 * complaint against the block a coordinator resolves it from.
 */

// ─── the suggested solutions ───────────────────────────────────────────────

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE HEART OF THE PRODUCT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The paper HELP SLIP asks the person reporting a problem to also propose up
 * to three fixes, and this is where those come back out — to the raiser, who
 * finds out which one was used, and to the coordinator, who picks one.
 *
 * ONE component, two modes, and the modes are drawn DIFFERENTLY on purpose:
 *
 *   accepted  green   — the server's answer. "This one was used."
 *   chosen    brand   — the coordinator's answer-in-progress, local until the
 *                       resolve commits it.
 *
 * They can be true at once and must not look like the same fact. Collapsing
 * them into one style is how "I have picked this" starts reading as "this was
 * already accepted".
 *
 * When `onPick` is given the list becomes a real `radiogroup` of `role=radio`
 * buttons, so arrow keys work and a screen reader announces "2 of 3" — a row
 * of clickable divs would give neither.
 */
export function SolutionList({
  solutions,
  acceptedId,
  pickedId,
  onPick,
  disabled,
  labelledBy,
}: {
  solutions: ConcernSolutionRow[];
  acceptedId: string | null;
  /** The coordinator's local choice. Ignored when `onPick` is absent. */
  pickedId?: string | null;
  onPick?: (id: string | null) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  if (solutions.length === 0) {
    return (
      <p className={cn("deva text-text-3", T.bodySm)}>
        <Bi
          en="No solutions were suggested."
          hi="कोई समाधान नहीं सुझाया गया।"
        />
      </p>
    );
  }

  const selectable = typeof onPick === "function";

  return (
    <ol
      role={selectable ? "radiogroup" : undefined}
      aria-labelledby={selectable ? labelledBy : undefined}
      className="flex flex-col gap-2"
    >
      {solutions.map((s) => {
        const accepted = s.id === acceptedId;
        const chosen = selectable && pickedId === s.id;

        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "num grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                accepted
                  ? "bg-status-green text-surface"
                  : chosen
                    ? "bg-primary text-primary-foreground"
                    : "bg-chip text-text-2",
              )}
            >
              {accepted || chosen ? (
                <IconCheck className="size-4" stroke={2.4} />
              ) : (
                s.position
              )}
            </span>

            <span className="min-w-0">
              <span
                className={cn(
                  "deva block whitespace-pre-line text-text-1",
                  T.body,
                )}
              >
                {s.body}
              </span>
              {accepted ? (
                <span
                  className={cn(
                    "deva mt-1 block font-semibold text-status-green",
                    T.caption,
                  )}
                >
                  <Bi
                    en="Accepted by the coordinator"
                    hi="कोऑर्डिनेटर ने माना"
                  />
                </span>
              ) : chosen ? (
                <span
                  className={cn(
                    "deva mt-1 block font-semibold text-accent-text",
                    T.caption,
                  )}
                >
                  <Bi en="Selected" hi="चुना गया" />
                </span>
              ) : null}
            </span>
          </>
        );

        const shell = cn(
          "flex w-full gap-3 rounded-card border p-3 text-left transition-colors",
          // The accepted one gets the ONLY green on the page: it is the payoff
          // of the entire product — the person who proposed the fix finding
          // out that it was theirs.
          accepted
            ? "border-status-green bg-status-green-dim"
            : chosen
              ? "border-primary bg-accent"
              : "border-border bg-surface",
        );

        return (
          <li key={s.id}>
            {selectable ? (
              <button
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={disabled}
                onClick={() => onPick?.(chosen ? null : s.id)}
                className={cn(
                  shell,
                  "cursor-pointer outline-none",
                  !accepted && !chosen && "hover:bg-surface-2",
                  "focus-visible:ring-3 focus-visible:ring-ring/40",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {body}
              </button>
            ) : (
              <div className={shell}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── the meta rail ─────────────────────────────────────────────────────────

/**
 * One fact, as a two-column row rather than a stacked pair.
 *
 * Stacked, each fact costs two lines and a rule — seven facts came to roughly
 * 300px of rail to say seven short things, which was most of why this screen
 * scrolled. Side by side, the label sits in a fixed column and the value
 * starts on the same baseline, so the block reads as a table at about half the
 * height.
 */
export function MetaRow({
  labelEn,
  labelHi,
  children,
}: {
  labelEn: string;
  labelHi?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border py-1.5 last:border-b-0">
      <dt className={cn("deva w-24 shrink-0 text-text-3", T.caption)}>
        <Bi en={labelEn} hi={labelHi} />
      </dt>
      <dd className={cn("deva min-w-0 flex-1 text-text-1", T.bodySm)}>
        {children}
      </dd>
    </div>
  );
}

// ─── the concern number, and a way to quote it ─────────────────────────────

/**
 * `LD-019`, with one tap to copy it.
 *
 * The number is the thing somebody reads out on the phone or pastes into
 * WhatsApp, so copying it must not mean selecting six characters on a
 * touchscreen. Falls back silently when the Clipboard API is unavailable
 * (an insecure origin, an old webview) — a copy button that throws is worse
 * than one that quietly does nothing, because the number is still on screen.
 *
 * `size` is the one thing that varies, and it varies for a reason. Beside a
 * title the number is a caption — a handle on a page that already says what it
 * is about. On the FILED confirmation it IS the message: the only thing the
 * person now holds, and the thing they will read out across a noisy floor. One
 * component either way, so there is still exactly one copy affordance in this
 * module rather than a second one written out at display size.
 */
export function ConcernNumber({
  value,
  size = "sm",
}: {
  value: string;
  /** `lg` is the filed confirmation. Everywhere else is `sm`. */
  size?: "sm" | "lg";
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const large = size === "lg";

  return (
    <span className={cn("inline-flex items-center", large ? "gap-2" : "gap-1")}>
      <span
        className={cn(
          "num",
          large ? cn("text-text-1", T.display) : cn("text-text-3", T.caption),
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={copied ? "Copied" : `Copy concern number ${value}`}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
        className={cn(
          "grid cursor-pointer place-items-center rounded-field text-text-3 outline-none transition-colors hover:bg-chip hover:text-text-1 focus-visible:ring-3 focus-visible:ring-ring/40",
          large ? "size-11" : "size-6",
        )}
      >
        {copied ? (
          <IconCheck
            className={large ? "size-5 text-status-green" : "size-3.5 text-status-green"}
            stroke={2}
            aria-hidden
          />
        ) : (
          <IconCopy
            className={large ? "size-5" : "size-3.5"}
            stroke={1.6}
            aria-hidden
          />
        )}
      </button>
    </span>
  );
}

/**
 * The confidential marker. `hr_only` — see D4.
 *
 * Shown, not hidden: the person who ticked the box is entitled to see that it
 * took. It says "Confidential", never "HR only", because this system has no HR
 * role — the rule is `can_see_hr()`: an admin, or a coordinator whose profile
 * carries the confidential-access flag.
 */
export function ConfidentialMark() {
  return (
    <span
      className={cn(
        "deva inline-flex items-center gap-1 text-text-3",
        T.caption,
      )}
    >
      <IconLock className="size-3.5 shrink-0" stroke={1.6} aria-hidden />
      <Bi en="Confidential" hi="गोपनीय" />
    </span>
  );
}

// ─── "due in 6h" / "2d overdue" ────────────────────────────────────────────

/** The single number a coordinator scans for. Nothing for finished work. */
export function SlaLabel({
  slaDueAt,
  status,
  locale,
}: {
  slaDueAt: string | null;
  status: string;
  locale: "en" | "hi";
}) {
  if (!slaDueAt) return <span className="text-text-3">—</span>;
  if (status === "resolved" || status === "closed") {
    return <span className="text-text-3">—</span>;
  }

  const ms = new Date(slaDueAt).getTime() - Date.now();
  const hours = Math.floor(Math.abs(ms) / 3_600_000);
  const short = hours >= 24 ? `${Math.floor(hours / 24)}d` : `${Math.max(hours, 0)}h`;

  return (
    <span
      title={absoluteTime(slaDueAt, locale)}
      className={cn(
        "num whitespace-nowrap",
        ms < 0 ? "font-semibold text-status-red" : "text-text-2",
      )}
    >
      {ms < 0 ? `${short} overdue` : `in ${short}`}
    </span>
  );
}

// ─── a modal ───────────────────────────────────────────────────────────────

/**
 * The dialog shape all four workspace prompts share.
 *
 * `error` sits INSIDE the dialog rather than as a toast behind it: the
 * refusal belongs to the thing being confirmed, and a message that appears
 * behind a modal is a message nobody reads.
 */
export function HsModal({
  open,
  onOpenChange,
  titleEn,
  titleHi,
  descriptionEn,
  descriptionHi,
  error,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleEn: string;
  titleHi?: string;
  descriptionEn?: string;
  descriptionHi?: string;
  error?: React.ReactNode;
  footer: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={cn("deva", T.h3)}>
            <Bi en={titleEn} hi={titleHi} />
          </DialogTitle>
          {descriptionEn ? (
            <DialogDescription className={cn("deva text-text-3", T.bodySm)}>
              <Bi en={descriptionEn} hi={descriptionHi} />
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {children ? <div className="flex flex-col gap-3">{children}</div> : null}

        {error ? (
          <p
            role="alert"
            className={cn(
              "deva rounded-field border border-status-red/35 bg-status-red-dim px-3 py-2 text-status-red",
              T.caption,
            )}
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The Cancel that every one of those dialogs carries. */
export function ModalCancel({ disabled }: { disabled?: boolean }) {
  return (
    <DialogClose
      render={<Button variant="outline" className="h-11" disabled={disabled} />}
    >
      <Bi en="Cancel" hi="रद्द करें" />
    </DialogClose>
  );
}

/** Overdue, as the marker that rides BESIDE a status rather than replacing it. */
export function OverdueMark() {
  return (
    <IconAlertTriangle
      className="size-4 shrink-0 text-status-red"
      stroke={1.6}
      aria-label="Overdue"
    />
  );
}
