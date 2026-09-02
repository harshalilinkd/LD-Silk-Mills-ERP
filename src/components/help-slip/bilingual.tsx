import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The bilingual rule, as two components. Read this before writing Hindi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Help Slip is functionally bilingual: half the people who file a concern read
 * Hindi more comfortably than English, and the paper slip this app replaces
 * was printed in both. So Hindi is not decoration and it is not a locale
 * toggle away — where a label matters, both languages are on screen at once.
 *
 * But they are NOT equals on the page. Hindi SUPPORTS the English beside it:
 *
 *   - 0.85em, weight 400, `--text-3` (the `.hi` utility in globals.css)
 *   - INLINE and parenthetical — "Resolved (हल हो गया)", never stacked
 *   - never the same size or weight as the English it glosses
 *
 * Stacked, every label costs a second line and four single-digit KPI cards
 * become a row of half-empty boxes. Same-size, the eye cannot tell which one
 * it is supposed to read first.
 *
 * ⚠️ NEVER `uppercase` or `letter-spacing` on a string that may be Hindi.
 * Devanagari has no case, and tracking shatters conjuncts. `.deva` defensively
 * strips both, on top of supplying the 1.65 line-height matras need — it is on
 * every element below and belongs on any element that may hold Hindi.
 *
 * The one deliberate exception is a TABLE COLUMN HEADER: those carry uppercase
 * + tracking per docs/DESIGN.md and are English-only by design, exactly as
 * they are in the source app. Pass plain strings there, not <Bi>.
 */

export type BiProps = {
  en: string;
  /** Omit and only the English renders — correct for a value, not a label. */
  hi?: string | null;
  className?: string;
};

/** `Resolved (हल हो गया)`. The default form for any label in this module. */
export function Bi({ en, hi, className }: BiProps) {
  return (
    <span className={cn("deva", className)}>
      {en}
      {hi ? <span className="deva hi"> ({hi})</span> : null}
    </span>
  );
}

/**
 * The Hindi half on its own, for the few places the English is already set as
 * a heading and the gloss follows it as a second element rather than inside
 * it — an empty state's title, say, where the two want different line lengths.
 */
export function Hi({ children, className }: React.ComponentProps<"span">) {
  if (!children) return null;
  return <span className={cn("deva hi", className)}>{children}</span>;
}
