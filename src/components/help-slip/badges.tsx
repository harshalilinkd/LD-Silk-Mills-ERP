import {
  EM_DASH,
  OVERDUE_META,
  priorityMeta,
  statusMeta,
} from "@/lib/help-slip/meta";
import { cn } from "@/lib/utils";

/**
 * The three marks every Help Slip row wears. All of them read their colour,
 * icon and label out of `src/lib/help-slip/meta.ts` — there is no conditional
 * in this file that maps a status to anything, and there should not be one
 * anywhere else either.
 *
 * ── THE GEOMETRY IS `ui/status-badge.tsx`, TO THE PIXEL ───────────────────
 * `rounded-pill`, `px-2 py-[3px]`, `text-[10.5px] leading-none font-semibold`,
 * a tinted fill under the solid hue — and UPPERCASE, which is what the ERP
 * badge renders (it prints its enum raw: `COMPLETED`, `PARTIALLY COMPLETED`).
 * Help Slip's labels are sentence case in `meta.ts` because they are also read
 * aloud, so the casing is applied here rather than baked into the data.
 *
 * This file used to hold the `sm` label at 11px and refuse the ERP's 10.5,
 * because the Devanagari gloss rendered at 0.85em and 10.5 would have set it
 * under 9px. There is no gloss now, so there is no floor and no departure left
 * to justify: the badge is the ERP's badge.
 *
 * `md` is the same pill one step up, for a detail header — where it sits
 * beside a 22px title rather than inside a 13px table row.
 */

type Size = "sm" | "md";

const PILL_BASE =
  "inline-flex items-center gap-1 leading-none font-semibold whitespace-nowrap uppercase";

/** `sm` is `ui/status-badge.tsx` verbatim; `md` is the detail-header step. */
const PILL_SIZE = {
  sm: "px-2 py-[3px] text-[10.5px]",
  md: "px-2.5 py-1 text-[11px]",
} as const;

const GLYPH_SIZE = { sm: "size-3", md: "size-3.5" } as const;

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
  className,
}: {
  status: string | null | undefined;
  size?: Size;
  className?: string;
}) {
  const meta = statusMeta(status);

  if (!meta) {
    return (
      <span
        className={cn(
          PILL_BASE,
          PILL_SIZE[size],
          "rounded-pill bg-chip text-text-3",
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
        PILL_BASE,
        PILL_SIZE[size],
        "rounded-pill",
        meta.fgClass,
        meta.bgClass,
        className,
      )}
    >
      <Icon
        className={cn("shrink-0", GLYPH_SIZE[size])}
        stroke={1.6}
        aria-hidden
      />
      {meta.labelEn}
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
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const Icon = OVERDUE_META.icon;
  return (
    <span
      className={cn(
        PILL_BASE,
        PILL_SIZE[size],
        "rounded-pill border",
        OVERDUE_META.fgClass,
        OVERDUE_META.bgClass,
        OVERDUE_META.borderClass,
        className,
      )}
    >
      <Icon
        className={cn("shrink-0", GLYPH_SIZE[size])}
        stroke={1.6}
        aria-hidden
      />
      {OVERDUE_META.labelEn}
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
  alwaysShow = false,
  className,
}: {
  priority: string | null | undefined;
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
        PILL_BASE,
        PILL_SIZE.sm,
        "rounded-pill border bg-transparent",
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
        <Icon className="size-3 shrink-0" stroke={1.6} aria-hidden />
      ) : null}
      {meta.labelEn}
    </span>
  );
}
