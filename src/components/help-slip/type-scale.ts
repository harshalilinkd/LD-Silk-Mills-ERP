/**
 * Help Slip's type scale, as class strings.
 *
 * These ARE the shell's sizes. Order Entry and CRM are the reference: a 22/700
 * page title, a 14.5/700 panel head, a 13px body, a 12.5px small, 11.5px
 * captions, a 19px KPI figure (ui/stat-card.tsx). A module that reads one step
 * larger than the rest of the ERP reads as a different application, which is
 * the only thing this file used to guarantee.
 *
 * SIZE AND WEIGHT ONLY. No `leading-*` and no `tracking-*`: every consumer of
 * these strings sits on a `.deva` element, and `.deva` (globals.css) sets
 * line-height 1.65, text-transform none and letter-spacing normal — Devanagari
 * matras need the leading and conjuncts shatter under tracking. The ERP's own
 * -0.01em on the page title is therefore deliberately not ported; at 22px it is
 * a quarter of a pixel and the bilingual rule outranks it.
 *
 * The MOBILE half of the old scale is kept and moved to where it belongs: not
 * on static text, but on the controls, as responsive classes — see CONTROL.
 *
 * Radii stay on this repo's scale (`rounded-card` 10px / `rounded-field` 8px /
 * `rounded-pill`), as they already did.
 *
 * These are plain string constants rather than `@utility` classes so that
 * Tailwind's scanner sees the literal utilities and emits them; a component
 * writing `T.h1` gets exactly what a component writing the classes inline
 * would.
 */
export const T = {
  /** KPI figure. 19 / 600 — ui/stat-card.tsx's value, the ERP module KPI. Pair with `.num`. */
  display: "text-[19px] font-semibold",
  /** Page title. 22 / 700 — the ERP page h1 (20+ files). No `tracking`: see the note below. */
  h1: "text-[22px] font-bold",
  /** Section. 15 / 600 — the ERP's CRM section head. Currently unused; kept for parity. */
  h2: "text-[15px] font-semibold",
  /** Panel title. 14.5 / 700 — the ERP panel h2 (docs/DESIGN.md § Cards). */
  h3: "text-[14.5px] font-bold",
  /** Body. 13 / 400 — the ERP workhorse. */
  body: "text-[13px]",
  /** Small. 12.5 / 400 — the ERP's banner/hint/meta size. */
  bodySm: "text-[12.5px]",
  /** Form label. 13 / 500 — order-form.tsx's Field label, exactly. */
  label: "text-[13px] font-medium",
  /** Caption. 11.5 / 400 — the ERP count-chip / sub-caption size. */
  /**
   * Caption. 12 / 400 — the floor, and it is a bilingual floor, not an English
   * one.
   *
   * The ERP's own caption is 11.5px, and this was 11.5px for a moment. But
   * `.hi` renders the Hindi gloss at 0.85em, so 11.5 sets it at 9.78px — under
   * the ~10px floor that `badges.tsx` and `kpi-strip.tsx` both refuse to cross
   * for exactly this reason. Captions here are not ornament: they carry the
   * field helper text, the Details table's labels, the sentence explaining why
   * an action is blocked, the delete warning, and — the one that decides it —
   * the line reading "Internal note — the employee cannot see this". A module
   * whose readers are more comfortable in Hindi cannot set that sentence below
   * the point it can be read. 12 × 0.85 = 10.2px, which clears it.
   */
  caption: "text-[12px]",
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
 * Tokens and the focus ring are unchanged — they already matched the ERP.
 */
export const CONTROL =
  "h-11 rounded-field border border-border bg-surface px-3 text-base text-text-1 outline-none transition-colors placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:px-2.5 md:text-[13px]";
