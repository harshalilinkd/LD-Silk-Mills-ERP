/**
 * Help Slip's type scale, as class strings.
 *
 * These ARE the shell's sizes. Order Entry and CRM are the reference: a 22/700
 * page title, a 15/600 panel-strip head, a 14.5/700 form-card head, a 13px
 * body, a 12.5px small, an 11.5px caption, a 19px KPI figure
 * (ui/stat-card.tsx). A module that reads one step larger than the rest of the
 * ERP reads as a different application.
 *
 * SIZE AND WEIGHT ONLY, with one exception: `h1` carries the ERP's own
 * `-0.01em`, which every other page title in the app has. There is no
 * `leading-*` here — an arbitrary `text-[13px]` emits no line-height, so the
 * document's 1.5 governs, which is what Order Entry gets too. Anything that
 * needs a tighter line (a KPI figure, a badge) sets `leading-tight` /
 * `leading-none` at the call site, as the ERP does.
 *
 * The MOBILE half of the scale lives where it belongs: not on static text, but
 * on the controls, as responsive classes — see CONTROL.
 *
 * Radii stay on this repo's scale (`rounded-card` 10px / `rounded-field` 8px /
 * `rounded-pill`).
 *
 * These are plain string constants rather than `@utility` classes so that
 * Tailwind's scanner sees the literal utilities and emits them; a component
 * writing `T.h1` gets exactly what a component writing the classes inline
 * would.
 */
export const T = {
  /** KPI figure. 19 / 600 — ui/stat-card.tsx's value, the ERP module KPI. Pair with `.num`. */
  display: "text-[19px] font-semibold",
  /** Page title. 22 / 700 / -0.01em — the ERP page h1, verbatim (20+ files). */
  h1: "text-[22px] font-bold tracking-[-0.01em]",
  /** Panel-strip head. 15 / 600 — a card whose tinted head sits over a table or list (§J.1). */
  h2: "text-[15px] font-semibold",
  /** Form-card head. 14.5 / 700 — a card that contains fields or prose (§J.1). */
  h3: "text-[14.5px] font-bold",
  /** Body. 13 / 400 — the ERP workhorse. */
  body: "text-[13px]",
  /** Small. 12.5 / 400 — the ERP's banner/hint/meta size. */
  bodySm: "text-[12.5px]",
  /** Form label. 13 / 500 — order-form.tsx's Field label, exactly. */
  label: "text-[13px] font-medium",
  /**
   * Caption. 11.5 / 400 — the ERP's count-chip / sub-caption size.
   *
   * This was pinned at 12px for one reason only: the Hindi gloss rendered at
   * 0.85em, so 11.5 set it at 9.78px, under the ~10px floor. Help Slip is
   * English-only now, the gloss is gone, and the floor with it — so the
   * caption returns to the size the rest of the ERP uses.
   */
  caption: "text-[11.5px]",
} as const;

/**
 * The module's one input/select/date-field recipe.
 *
 * TWO SIZES, ON PURPOSE.
 *
 *  · Below `md` it is 44px tall with 16px text. 44px is the minimum touch
 *    target for a phone held one-handed on a factory floor, and anything under
 *    16px makes iOS Safari auto-zoom on focus — after which it never zooms back
 *    out and the person is stranded on a 2× page. Both halves are real
 *    usability, not decoration, and neither may be removed.
 *  · From `md` up it is 36px with 13px text — the ERP's compact control
 *    (orders-dashboard's `h-9 … text-[13px]`, order-filters' `FIELD_CLASS`),
 *    because that is where the "this module looks like a different app"
 *    complaint lives. The pattern is native: `ui/input.tsx` already ships
 *    `text-base … md:text-sm` for exactly this reason.
 *
 * Because every control in this module carries CONTROL, a field grid needs no
 * `[&_input]:h-9` descendant override — and must not add one, since 36px below
 * `md` breaks the touch target above.
 */
export const CONTROL =
  "h-11 rounded-field border border-border bg-surface px-3 text-base text-text-1 outline-none transition-colors placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:px-2.5 md:text-[13px]";
