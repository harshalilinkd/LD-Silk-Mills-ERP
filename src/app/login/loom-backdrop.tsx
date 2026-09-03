"use client";

import * as React from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Silk. Threads under a travelling sheen.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The first version drew an orthogonal plain weave — a technically correct
 * weave, with real over-under interlacing — and it read as graph paper. "Plain
 * and boring" was the verdict and it was right: a rigid grid at 10% alpha is a
 * background texture, not an image of silk.
 *
 * This draws what silk actually DOES. A bolt of it is hundreds of near-parallel
 * filaments, and the thing that makes it silk rather than cotton is that light
 * runs ACROSS those filaments in a band as the cloth moves — the sheen. So:
 *
 *   · ~110 threads, each undulating on its own phase, so the cloth has drape
 *     rather than being ruled.
 *   · A sheen band travelling diagonally across them, slowly. A thread inside
 *     the band is bright mint; a thread outside it is nearly the ground. That
 *     gradient IS the effect — silk is not a colour, it is a highlight moving
 *     over one.
 *   · Each thread is drawn in short SEGMENTS so its brightness varies along
 *     its length. Stroked as one path per thread, the band would light whole
 *     threads at once and the panel would look like a barcode.
 *
 * ── THE PANEL IS DARK IN BOTH THEMES, DELIBERATELY ────────────────────────
 *
 * docs/DESIGN.md forbids hardcoded colours because they are wrong in one theme.
 * This is the exception that rule allows: the panel is one committed visual
 * world, dark in both, so the constants below are constants on purpose. The
 * previous version used tokens and therefore put a near-white panel beside a
 * near-white form in light mode — no contrast anywhere, which is most of why
 * the screen read as flat. A deep ground is also the only ground a sheen shows
 * on at all.
 *
 * ── MOTION ────────────────────────────────────────────────────────────────
 * `prefers-reduced-motion` draws one frame with the sheen parked and stops.
 * Silk that is not moving is still silk.
 */

/** Deep teal-black — the brand hue taken almost to black. */
const GROUND_TOP = "#071a18";
const GROUND_BOTTOM = "#04100f";
/** Thread at rest, and thread at the centre of the sheen. */
const THREAD_DIM = "45, 212, 191"; // --primary as rgb parts
const THREAD_LIT = "150, 255, 236";

const THREADS = 110;
const SEGMENTS = 26;

export function LoomBackdrop({ className }: { className?: string }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    /**
     * Per-thread constants, fixed once so the cloth keeps a stable identity
     * instead of reshuffling every frame. Deterministic — no `Math.random` —
     * so every load looks the same.
     */
    const phase = Array.from({ length: THREADS }, (_, i) => i * 0.7);
    const sway = Array.from({ length: THREADS }, (_, i) => 6 + ((i * 13) % 9));

    const draw = (t: number) => {
      // ── the ground ───────────────────────────────────────────────────
      const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
      g.addColorStop(0, GROUND_TOP);
      g.addColorStop(1, GROUND_BOTTOM);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const gap = w / (THREADS - 1);
      // The sheen runs on a diagonal, so it crosses the panel rather than
      // wiping down it. One pass takes about fourteen seconds.
      const travel = ((t * 0.072) % 1.6) - 0.3;
      const BAND = 0.22; // width of the lit band, as a fraction of a pass

      ctx.lineCap = "round";
      ctx.lineWidth = 1.15;

      for (let i = 0; i < THREADS; i += 1) {
        const baseX = i * gap;
        for (let s = 0; s < SEGMENTS; s += 1) {
          const y0 = (s / SEGMENTS) * h;
          const y1 = ((s + 1) / SEGMENTS) * h;

          // Drape: each thread leans on its own slow sine, and the lean grows
          // toward the bottom, the way hanging cloth does.
          const bend = (y: number) =>
            Math.sin(y * 0.0055 + phase[i]! + t * 0.22) *
            sway[i]! *
            (0.35 + y / h);

          const x0 = baseX + bend(y0);
          const x1 = baseX + bend(y1);

          // Where this segment sits along the diagonal, and how far it is from
          // the centre of the travelling band.
          const along = (baseX / w) * 0.68 + (y0 / h) * 0.32;
          const lit = Math.max(0, 1 - Math.abs(along - travel) / BAND) ** 1.8;

          // 0.13 at rest, not 0.055: between passes the panel was an empty
          // rectangle. Threads fade UP toward the top, where the eye lands
          // first and where no copy sits.
          const rest = 0.13 * (1.25 - (y0 / h) * 0.5);
          ctx.strokeStyle = `rgba(${lit > 0.02 ? THREAD_LIT : THREAD_DIM}, ${
            rest + lit * 0.72
          })`;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }

      // A soft bloom over the band, so the highlight reads as light falling on
      // a surface rather than as a set of brighter lines.
      const bx = (travel * 1.45 - 0.1) * w;
      const bloom = ctx.createRadialGradient(
        bx,
        h * 0.42,
        0,
        bx,
        h * 0.42,
        w * 0.5,
      );
      bloom.addColorStop(0, "rgba(120, 255, 235, 0.055)");
      bloom.addColorStop(1, "rgba(120, 255, 235, 0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
    };

    let raf = 0;
    let start = 0;
    const loop = (now: number) => {
      if (!start) start = now;
      draw((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };

    const begin = () => {
      cancelAnimationFrame(raf);
      start = 0;
      if (reduced.matches) {
        draw(5.2);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    begin();
    reduced.addEventListener("change", begin);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      reduced.removeEventListener("change", begin);
    };
  }, []);

  // Decorative. The panel carries the words, so a screen reader loses nothing
  // by never being told this exists.
  return <canvas ref={ref} aria-hidden className={className} />;
}
