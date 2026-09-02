import {
  EM_DASH,
  OVERDUE_META,
  priorityMeta,
  statusMeta,
  type HelpSlipLocale,
} from "@/lib/help-slip/meta";
import { cn } from "@/lib/utils";

/**
 * The three marks every Help Slip row wears. All of them read their colour,
 * icon and label out of `src/lib/help-slip/meta.ts` — there is no conditional
 * in this file that maps a status to anything, and there should not be one
 * anywhere else either.
 *
 * Geometry follows docs/DESIGN.md's status pill (radius 99px / `rounded-pill`,
 * tinted fill + solid hue text) rather than the source's `rounded-full` +
 * `text-caption`, which is the same shape one token system over.
 */

type Size = "sm" | "md";

/**
 * A soft-filled PILL: icon + label + tint, and no border.
 *
 * ICON AND LABEL, ALWAYS — status is never carried by colour alone. That is a
 * WCAG requirement, and it is also the difference between readable and
 * unreadable on a mid-range phone held in Bhiwandi sunlight.
 *
 * No border on top of the tint, deliberately: the fill already separates it
 * from the surface, and a border as well is what made the source's v1 badges
 * look like tiny buttons.
 *
 * An unmapped status renders an EM DASH in the neutral chip, never the raw
 * enum. If a sixth status is added upstream the badge goes quiet and somebody
 * comes looking at meta.ts, rather than a screen quietly printing `escalated`.
 */
export function StatusBadge({
  status,
  size = "sm",
  locale = "en",
  bilingual = false,
  className,
}: {
  status: string | null | undefined;
  size?: Size;
  locale?: HelpSlipLocale;
  /** Shows both, as "Resolved · हल हो गया". For a detail header, not a row. */
  bilingual?: boolean;
  className?: string;
}) {
  const meta = statusMeta(status);

  if (!meta) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-pill bg-chip px-2.5 py-1 font-semibold text-text-3",
          size === "sm" ? "text-[11px]" : "text-[13px]",
          className,
        )}
      >
        {EM_DASH}
      </span>
    );
  }

  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap",
        size === "sm"
          ? "px-2.5 py-1 text-[11px] leading-none"
          : "px-3 py-1.5 text-[13px] leading-none",
        meta.fgClass,
        meta.bgClass,
        className,
      )}
    >
      <Icon
        className={cn("shrink-0", size === "sm" ? "size-3.5" : "size-4")}
        stroke={1.6}
        aria-hidden
      />
      <span className="deva">
        {bilingual
          ? `${meta.labelEn} · ${meta.labelHi}`
          : locale === "hi"
            ? meta.labelHi
            : meta.labelEn}
      </span>
    </span>
  );
}

/**
 * Appears BESIDE the status badge, never instead of it.
 *
 * A concern can be `waiting` AND overdue at once, and the coordinator needs
 * both facts — collapsing the two throws away the one they would act on. It is
 * a BORDERED chip rather than a second filled pill so the pair never reads as
 * two competing statuses.
 */
export function OverdueBadge({
  size = "sm",
  locale = "en",
  className,
}: {
  size?: Size;
  locale?: HelpSlipLocale;
  className?: string;
}) {
  const Icon = OVERDUE_META.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-field border font-semibold whitespace-nowrap",
        size === "sm"
          ? "px-2 py-[3px] text-[11px] leading-none"
          : "px-3 py-1 text-[13px] leading-none",
        OVERDUE_META.fgClass,
        OVERDUE_META.bgClass,
        OVERDUE_META.borderClass,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" stroke={1.6} aria-hidden />
      <span className="deva">
        {locale === "hi" ? OVERDUE_META.labelHi : OVERDUE_META.labelEn}
      </span>
    </span>
  );
}

/**
 * OUTLINE ONLY, and `null` for low and normal.
 *
 * A filled chip would compete with the status badge and every row would end up
 * shouting twice. Rendering nothing for ~80% of rows is precisely what makes
 * High and Urgent register when they do appear — so the empty return below is
 * the feature, not a missing case.
 *
 * The outline takes the SOLID hue, not a soft tint: with a transparent fill
 * the border IS the chip, and a pale border sits at about 1.3:1 against the
 * surface.
 *
 * `urgent` alone gets a leading dot, as the one thing that stops a shift.
 */
export function PriorityChip({
  priority,
  locale = "en",
  alwaysShow = false,
  className,
}: {
  priority: string | null | undefined;
  locale?: HelpSlipLocale;
  /** Force a chip for low/normal. Nothing in these screens needs this. */
  alwaysShow?: boolean;
  className?: string;
}) {
  const meta = priorityMeta(priority);
  if (!meta) return null;
  if (!meta.chipClass && !alwaysShow) return null;

  const Icon = meta.icon;
  const outline = meta.chipClass ?? "border-border-strong text-text-2";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-field border bg-transparent px-2 py-[3px] text-[11px] leading-none font-semibold whitespace-nowrap",
        outline,
        className,
      )}
    >
      {meta.showDot ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden
        />
      ) : Icon ? (
        <Icon className="size-3.5 shrink-0" stroke={1.6} aria-hidden />
      ) : null}
      <span className="deva">
        {locale === "hi" ? meta.labelHi : meta.labelEn}
      </span>
    </span>
  );
}
