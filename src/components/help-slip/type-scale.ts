/**
 * Help Slip's type scale, as class strings.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHY THIS MODULE HAS ITS OWN SCALE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * docs/DESIGN.md governs colour everywhere in this repo, and these screens
 * obey it — every value below is a size or a weight, never a colour.
 *
 * The SIZES come from the standalone app's own scale (its design-system.md,
 * "Type scale"), because the Help Slip screens are meant to be that app,
 * restyled — not the shell's pages with Help Slip data in them. Its scale
 * runs one step larger than the shell's throughout (24px page titles against
 * the shell's 22px, a 16px body against 14px) for a reason worth keeping: a
 * good half of these readers are on a mid-range phone on a factory floor, and
 * the source's "13px is the floor, inputs are 16px minimum" rule is what stops
 * iOS Safari auto-zooming on focus and never zooming back out.
 *
 * The GEOMETRY does not come from the source: radii stay on this repo's scale
 * (`rounded-card` 10px / `rounded-field` 8px / `rounded-pill`), the same call
 * globals.css already documents for the Orders spec's radius names.
 *
 * These are plain string constants rather than `@utility` classes so that
 * Tailwind's scanner sees the literal utilities and emits them; a component
 * writing `T.h1` gets exactly what a component writing the classes inline
 * would.
 */
export const T = {
  /** KPI figure. 30 / 36 / 600. Pair with `.num` — it is always a number. */
  display: "text-[30px] leading-9 font-semibold",
  /** Page title. 24 / 32 / 600. */
  h1: "text-2xl leading-8 font-semibold",
  /** Section. 18 / 26 / 600. */
  h2: "text-[18px] leading-[26px] font-semibold",
  /** Card / panel title. 16 / 24 / 600. */
  h3: "text-base leading-6 font-semibold",
  /** 16 / 26 / 400. */
  body: "text-base leading-[26px]",
  /** 14 / 20 / 400. The workhorse. */
  bodySm: "text-sm leading-5",
  /** 14 / 20 / 500. */
  label: "text-sm leading-5 font-medium",
  /** 13 / 18 / 500. The floor — nothing in this module is smaller. */
  caption: "text-[13px] leading-[18px] font-medium",
} as const;

/**
 * Every control is 44px tall with 16px text.
 *
 * Both halves matter and both come from the source: 44px is the minimum touch
 * target, and anything under 16px makes iOS Safari auto-zoom on focus — after
 * which it never zooms back out and the person is stranded on a 2× page.
 */
export const CONTROL =
  "h-11 rounded-field border border-border bg-surface px-3 text-base text-text-1 outline-none transition-colors placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";
