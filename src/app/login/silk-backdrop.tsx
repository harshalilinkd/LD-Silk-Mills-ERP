"use client";

import * as React from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Draped silk, generated. The stand-in for the fabric photograph.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The approved design puts a photograph behind this screen: bolts of cream,
 * sage and teal silk in warm light, with cotton bolls at the lower left. That
 * photograph is the design, and this is NOT a claim to replace it — drop the
 * real file in at `public/login-bg.jpg` and `page.tsx` uses it instead of this
 * automatically. This is what the screen looks like until then, and it is
 * built to the same palette so the swap changes the texture and nothing else.
 *
 * ── WHAT IT DRAWS ─────────────────────────────────────────────────────────
 *
 * Folds, not threads. A previous version drew individual filaments and read as
 * a technical diagram; cloth at this scale is not filaments, it is BANDS of
 * light and shadow where the material turns. So:
 *
 *   · Six broad bands sweeping the canvas on a slow diagonal, each its own
 *     colour from the mockup's range — cream, sand, sage, teal.
 *   · Each band's edge is a soft vertical gradient, so it reads as a fold
 *     rolling over rather than a stripe.
 *   · A warm key light from the upper left and a cool fill from the lower
 *     right, which is the lighting in the photograph.
 *   · The whole drape breathes — the bands' phases drift over about ninety
 *     seconds, slowly enough that you notice it only if you stop and look.
 *
 * ── COMMITTED, NOT TOKENISED ──────────────────────────────────────────────
 *
 * Hardcoded colours, deliberately, exactly as the dark login panel is: this is
 * one photographic world and it does not invert for a theme. docs/DESIGN.md's
 * ban on literals protects components that must work on either ground. A
 * photograph is not one of them.
 *
 * `prefers-reduced-motion` renders one frame and stops.
 */

/** Sampled from the approved design, warm end to cool end. */
const BANDS = [
  { c: [246, 240, 229], w: 0.3, s: 0.0 }, // cream highlight
  { c: [226, 214, 195], w: 0.22, s: 1.1 }, // sand
  { c: [199, 205, 191], w: 0.26, s: 2.3 }, // pale sage
  { c: [150, 176, 170], w: 0.24, s: 3.4 }, // sage teal
  { c: [104, 146, 143], w: 0.2, s: 4.6 }, // teal
  { c: [74, 112, 111], w: 0.18, s: 5.7 }, // deep teal shadow
];

export function SilkBackdrop({ className }: { className?: string }) {
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
      const r = canvas.getBoundingClientRect();
      // Capped at 1.5 rather than 2: this fills the viewport, and a full-screen
      // gradient stack at 2× on a 4K display is a lot of pixels for a
      // background nobody is inspecting.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (t: number) => {
      // Warm ground, so any gap between bands still reads as lit cloth.
      ctx.fillStyle = "#efe7da";
      ctx.fillRect(0, 0, w, h);

      // ── the folds ────────────────────────────────────────────────────
      // Each band is a wide diagonal ribbon whose position eases over time.
      // `ease` is a sine, so the drape never snaps back to a start position.
      const diag = w + h;
      BANDS.forEach((band, i) => {
        const ease = Math.sin(t * 0.021 + band.s) * 0.5 + 0.5;
        const centre = ((i + 0.5) / BANDS.length) * 1.15 - 0.08 + ease * 0.06;
        const half = band.w * 0.5;

        const g = ctx.createLinearGradient(0, 0, w * 0.55, h);
        const [r, gr, bl] = band.c;
        const stop = (at: number, a: number) =>
          g.addColorStop(
            Math.min(1, Math.max(0, at)),
            `rgba(${r}, ${gr}, ${bl}, ${a})`,
          );
        stop(centre - half, 0);
        stop(centre - half * 0.45, 0.85);
        stop(centre, 1);
        stop(centre + half * 0.45, 0.85);
        stop(centre + half, 0);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // The bright line where the fold turns over — what makes it silk
        // rather than a painted stripe.
        const sheenAt =
          centre - half * 0.28 + Math.sin(t * 0.05 + band.s) * 0.012;
        const sg = ctx.createLinearGradient(0, 0, w * 0.55, h);
        sg.addColorStop(
          Math.min(1, Math.max(0, sheenAt - 0.035)),
          "rgba(255,255,255,0)",
        );
        sg.addColorStop(
          Math.min(1, Math.max(0, sheenAt)),
          "rgba(255,255,255,0.30)",
        );
        sg.addColorStop(
          Math.min(1, Math.max(0, sheenAt + 0.035)),
          "rgba(255,255,255,0)",
        );
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, w, h);
      });

      // ── the light ────────────────────────────────────────────────────
      // Warm key from the upper left, as in the photograph.
      const key = ctx.createRadialGradient(
        w * 0.22,
        h * 0.12,
        0,
        w * 0.22,
        h * 0.12,
        diag * 0.72,
      );
      key.addColorStop(0, "rgba(255, 244, 222, 0.55)");
      key.addColorStop(1, "rgba(255, 244, 222, 0)");
      ctx.fillStyle = key;
      ctx.fillRect(0, 0, w, h);

      // Cool fill from the lower right, so the teal end has somewhere to sit.
      const fill = ctx.createRadialGradient(
        w * 0.88,
        h * 0.92,
        0,
        w * 0.88,
        h * 0.92,
        diag * 0.6,
      );
      fill.addColorStop(0, "rgba(58, 96, 96, 0.30)");
      fill.addColorStop(1, "rgba(58, 96, 96, 0)");
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);

      // A gentle vignette. Keeps the corners from competing with the card.
      const vig = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        diag * 0.22,
        w * 0.5,
        h * 0.5,
        diag * 0.72,
      );
      vig.addColorStop(0, "rgba(40, 46, 44, 0)");
      vig.addColorStop(1, "rgba(40, 46, 44, 0.30)");
      ctx.fillStyle = vig;
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
        draw(6);
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

  return <canvas ref={ref} aria-hidden className={className} />;
}
