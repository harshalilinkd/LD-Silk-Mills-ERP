/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The reliability score, and the three parts it is made of
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thresholds, band names and component weights are the original's, verbatim,
 * so a scorecard read here means the same thing as one read at Linkd Prints.
 *
 * ── WHY THE PARTS ARE SHOWN AS POINTS, NOT PERCENTAGES ───────────────────
 *
 * Each row prints what that part CONTRIBUTED to the score out of its own
 * maximum — On-time up to 50, Throughput up to 30, Consistency up to 20 — so
 * the three add up to the number beside them. Showing three percentages that
 * do not add up to the total is how somebody concludes the score is arbitrary.
 *
 * NO IMPORTS: the scorecard screen is a client component.
 */

export type GradeBand = {
  label: string;
  /** Tailwind text colour token. */
  text: string;
  /** Tailwind background for the chip. */
  chip: string;
  /** Fill for the three component bars. */
  bar: string;
};

/**
 * The five bands. The boundaries are the original's; only the palette is ours.
 *
 * "Watch" and "At risk" are deliberately amber and red rather than both red:
 * a score of 45 and a score of 12 are different conversations, and colouring
 * them the same removes the only signal that says which.
 */
export function gradeFor(score: number | null): GradeBand {
  if (score === null) {
    return { label: "No data", text: "text-text-3", chip: "bg-chip", bar: "bg-text-3/40" };
  }
  if (score >= 90) {
    return {
      label: "Excellent",
      text: "text-status-green",
      chip: "bg-status-green-dim",
      bar: "bg-status-green",
    };
  }
  if (score >= 75) {
    return {
      label: "Strong",
      text: "text-status-green",
      chip: "bg-status-green-dim",
      bar: "bg-status-green",
    };
  }
  if (score >= 60) {
    return {
      label: "Steady",
      text: "text-status-amber",
      chip: "bg-status-amber-dim",
      bar: "bg-status-amber",
    };
  }
  if (score >= 40) {
    return {
      label: "Watch",
      text: "text-status-amber",
      chip: "bg-status-amber-dim",
      bar: "bg-status-amber",
    };
  }
  return {
    label: "At risk",
    text: "text-status-red",
    chip: "bg-status-red-dim",
    bar: "bg-status-red",
  };
}

/** Shown on hover over the band chip, so the five words are not a mystery. */
export const GRADE_SCALE_TOOLTIP = [
  "How the score is banded:",
  "Excellent 90–100 — top performer",
  "Strong 75–89 — consistently good",
  "Steady 60–74 — solid, room to grow",
  "Watch 40–59 — needs attention",
  "At risk 0–39 — badly behind",
].join("\n");

export type ScoreParts = {
  label: string;
  /** Points contributed. */
  points: number;
  /** The most it could contribute. */
  max: number;
  hint: string;
}[];

/**
 * What each part put into the score. The weights match the ones in
 * `scorecard-query.ts` — half on-time, three-tenths throughput, a fifth
 * consistency — and if either side is ever changed, both must be.
 */
export function scoreParts(k: {
  onTimePct: number | null;
  completionPct: number | null;
  bestStreak: number;
}): ScoreParts {
  return [
    {
      label: "On-time",
      points: Math.round(0.5 * (k.onTimePct ?? 0)),
      max: 50,
      hint: "Half the score: what share of the work they finished was finished on or before its day.",
    },
    {
      label: "Throughput",
      points: Math.round(0.3 * (k.completionPct ?? 0)),
      max: 30,
      hint: "Three-tenths: how much of the work that has come round actually got done.",
    },
    {
      label: "Consistency",
      points: Math.round(0.2 * Math.min(100, ((k.bestStreak || 0) / 30) * 100)),
      max: 20,
      hint: "A fifth: their best run of consecutive on-time finishes. A run of 30 scores full marks.",
    },
  ];
}

/**
 * Which way the six-month trend is going.
 *
 * ±2 points is treated as flat on purpose. Month-to-month noise on a small
 * number of tasks moves the figure by a point or two constantly, and an arrow
 * that flips direction every month is worse than no arrow.
 */
export function trendDirection(series: (number | null)[]): {
  label: "Improving" | "Declining" | "Steady";
  delta: number | null;
  tone: "green" | "red" | "grey";
} {
  const known = series.filter((v): v is number => v !== null);
  if (known.length < 2) return { label: "Steady", delta: null, tone: "grey" };
  const delta = known[known.length - 1] - known[0];
  if (delta > 2) return { label: "Improving", delta, tone: "green" };
  if (delta < -2) return { label: "Declining", delta, tone: "red" };
  return { label: "Steady", delta, tone: "grey" };
}
