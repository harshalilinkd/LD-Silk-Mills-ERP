"use client";

import * as React from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconLock,
} from "@tabler/icons-react";

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
 * Each row is the ERP's ROW CARD (§E.4): `rounded-card border bg-surface p-3
 * text-left shadow-sm`, 10px apart, the border carrying the state. It is the
 * same shape the Orders list draws its mobile rows in, which is the point —
 * this is a list of records, not a list of paragraphs.
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
      <p className={cn("text-text-3", T.bodySm)}>
        No solutions were suggested.
      </p>
    );
  }

  const selectable = typeof onPick === "function";

  return (
    <ol
      role={selectable ? "radiogroup" : undefined}
      aria-labelledby={selectable ? labelledBy : undefined}
      className="flex flex-col gap-2.5"
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
                <IconCheck className="size-3.5" stroke={2.4} />
              ) : (
                s.position
              )}
            </span>

            <span className="min-w-0">
              <span
                className={cn("block whitespace-pre-line text-text-1", T.body)}
              >
                {s.body}
              </span>
              {accepted ? (
                <span
                  className={cn(
                    "mt-1 block font-semibold tracking-[0.04em] text-status-green uppercase",
                    T.caption,
                  )}
                >
                  Accepted by the coordinator
                </span>
              ) : chosen ? (
                <span
                  className={cn(
                    "mt-1 block font-semibold tracking-[0.04em] text-accent-text uppercase",
                    T.caption,
                  )}
                >
                  Selected
                </span>
              ) : null}
            </span>
          </>
        );

        const shell = cn(
          "flex w-full gap-2.5 rounded-card border p-3 text-left shadow-sm transition-colors",
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
                  "cursor-pointer outline-none active:scale-[.99]",
                  !accepted &&
                    !chosen &&
                    "hover:border-border-strong hover:bg-surface-2",
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
 *
 * The label is the ERP's metadata-strip label (§F.3, and `MetaItem` in
 * page-parts.tsx): 11px, uppercase, `tracking-[0.04em]`, on text-3. Both the
 * case change and the tracking became legal the moment the Hindi came out —
 * Devanagari has no case and its conjuncts shatter under letter-spacing, which
 * is the only reason this rail used to be the odd one out in the module.
 */
export function MetaRow({
  labelEn,
  children,
}: {
  labelEn: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border py-1.5 last:border-b-0">
      {/* w-24, not w-20: uppercase is wider than sentence case, and
          "COORDINATOR" wrapping to two lines would cost the rail exactly the
          height this row shape exists to save. */}
      <dt className="w-24 shrink-0 text-[11px] tracking-[0.04em] text-text-3 uppercase">
        {labelEn}
      </dt>
      <dd className={cn("min-w-0 flex-1 text-text-1", T.body)}>{children}</dd>
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
          // The ERP's mini-figure treatment. `tracking-[-0.02em]` belongs on
          // this span and nowhere near a label: its content is `LD-019` — a
          // number set in tabular figures, which tighten cleanly.
          large
            ? cn("text-text-1", "text-[24px] font-bold tracking-[-0.02em]")
            : cn("text-text-3", T.caption),
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
          // 44px below md: the minimum touch target for a phone held on the
          // factory floor. ERP-compact (36px) from md up.
          //
          // The inline `sm` affordance has to stay 24px — it sits on a caption
          // line beside an 11.5px number and a 44px box there would shove the
          // header apart — so it buys its touch target with a transparent
          // `::before` instead: 24px drawn, 44px tappable, zero layout. From
          // `md` the pointer is a mouse and the overlay goes away.
          large
            ? "size-11 md:size-9"
            : "relative size-6 before:absolute before:-inset-2.5 before:content-[''] md:before:hidden",
        )}
      >
        {copied ? (
          <IconCheck
            className={
              large
                ? "size-5 text-status-green md:size-4"
                : "size-3.5 text-status-green"
            }
            stroke={2}
            aria-hidden
          />
        ) : (
          <IconCopy
            className={large ? "size-5 md:size-4" : "size-3.5"}
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
 *
 * Drawn as the ERP's neutral pill, on badges.tsx's geometry: a marker that
 * rides beside a status badge has to be built like one, or it reads as a
 * stray line of caption text.
 */
export function ConfidentialMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-chip px-2 py-[3px] text-[10.5px] leading-none font-semibold text-text-2 uppercase">
      <IconLock className="size-3 shrink-0" stroke={1.6} aria-hidden />
      Confidential
    </span>
  );
}

// ─── "due in 6h" / "2d overdue" ────────────────────────────────────────────

/** The single number a coordinator scans for. Nothing for finished work. */
export function SlaLabel({
  slaDueAt,
  status,
}: {
  slaDueAt: string | null;
  status: string;
}) {
  if (!slaDueAt) return <span className="text-text-3">—</span>;
  if (status === "resolved" || status === "closed") {
    return <span className="text-text-3">—</span>;
  }

  const ms = new Date(slaDueAt).getTime() - Date.now();
  const hours = Math.floor(Math.abs(ms) / 3_600_000);
  const short =
    hours >= 24 ? `${Math.floor(hours / 24)}d` : `${Math.max(hours, 0)}h`;

  return (
    <span
      title={absoluteTime(slaDueAt)}
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
 * behind a modal is a message nobody reads. It is drawn as the ERP's notice
 * strip (§E.8) — `flex items-start gap-2 rounded-field border px-3 py-2` on
 * the red-dim fill — so a refusal here looks like a refusal everywhere else.
 *
 * `85dvh`, not `85vh`: on a phone `vh` is measured against the browser chrome
 * expanded, so a dialog sized in `vh` is taller than the window it is in and
 * its footer sits under the address bar.
 */
export function HsModal({
  open,
  onOpenChange,
  titleEn,
  descriptionEn,
  error,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleEn: string;
  descriptionEn?: string;
  error?: React.ReactNode;
  footer: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={T.h3}>{titleEn}</DialogTitle>
          {descriptionEn ? (
            <DialogDescription className={cn("text-text-3", T.bodySm)}>
              {descriptionEn}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {children ? (
          <div className="flex flex-col gap-4">{children}</div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className={cn(
              "flex items-start gap-2 rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-status-red",
              T.bodySm,
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
      // 44px below md: the minimum touch target for a phone held on the
      // factory floor. ERP-compact (36px) from md up.
      render={
        <Button variant="outline" className="h-11 md:h-9" disabled={disabled} />
      }
    >
      Cancel
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
