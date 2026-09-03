"use client";

import * as React from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The loom. A real plain weave, drawn to canvas, with a shuttle running.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LD Silk Mills weaves cloth, so the login screen weaves cloth. This is not an
 * ambient gradient with the brand colour poured over it — it is warp and weft
 * with correct OVER-UNDER interlacing, which is the one structure everybody in
 * this building would recognise on sight.
 *
 * ── HOW THE INTERLACING WORKS ─────────────────────────────────────────────
 *
 * A plain weave alternates: at each crossing either the warp passes over the
 * weft or the weft passes over the warp, and the parity flips every column and
 * every row. Painted naively — all warp, then all weft — the weft would sit on
 * top everywhere and it would read as a grid, not cloth. So there is a third
 * pass: at every crossing where `(col + row)` is even, a short piece of the
 * warp thread is repainted ON TOP of the weft. That third pass is the entire
 * difference between "graph paper" and "fabric".
 *
 * ── WHY CANVAS ────────────────────────────────────────────────────────────
 *
 * Around 1,000 crossings, each needing a short segment repainted every frame.
 * As SVG that is 3,000-odd nodes for the browser to lay out and diff; as
 * canvas it is a few hundred cheap strokes into a bitmap. docs/DESIGN.md's own
 * rule for generative work.
 *
 * ── COLOUR COMES FROM THE THEME, NEVER FROM A LITERAL ─────────────────────
 *
 * Every stroke reads `--accent-text` and `--border` off the element, so the
 * weave tracks light and dark automatically and cannot drift from the palette.
 * A `MutationObserver` on `<html>`'s class list re-reads them when the theme
 * toggles — `getComputedStyle` per frame would be the obvious way and is far
 * too expensive at 60fps.
 *
 * ── MOTION IS OPTIONAL ────────────────────────────────────────────────────
 *
 * `prefers-reduced-motion` draws ONE frame and stops. Not a blank panel — the
 * cloth is the design, and somebody who has asked for less movement should
 * still get it. They simply get it still.
 */

type Palette = {
  thread: string;
  ground: string;
  /**
   * Alpha multiplier for the current theme.
   *
   * The same alpha does NOT read the same on both grounds. On dark, a pale
   * teal at 0.10 over near-black is clearly there; on light, the deep teal
   * (#0f766e) at 0.10 over white is almost nothing — the first light-mode pass
   * rendered an all-but-blank panel. Light needs roughly double to sit at the
   * same visual weight, which is a property of the eye rather than of the
   * colour.
   */
  lift: number;
};

const WARP_GAP = 26; // px between vertical threads
const WEFT_GAP = 26; // px between horizontal threads

export function LoomBackdrop({ className }: { className?: string }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Read the palette once per theme change rather than per frame.
    let palette: Palette = { thread: "#2dd4bf", ground: "#0f1417", lift: 1 };
    const readPalette = () => {
      const s = getComputedStyle(canvas);
      const dark = document.documentElement.classList.contains("dark");
      palette = {
        thread: s.getPropertyValue("--accent-text").trim() || "#2dd4bf",
        ground: s.getPropertyValue("--surface").trim() || "#0f1417",
        lift: dark ? 1 : 2.1,
      };
    };
    readPalette();

    const themeWatcher = new MutationObserver(readPalette);
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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
     * One frame.
     *
     * `t` is seconds. Everything that moves is a slow function of it — the
     * whole cloth breathes about once every 40 seconds, and the shuttle
     * crosses in roughly 9. Nothing here is fast; a login screen that
     * demands attention is a login screen that is in the way.
     */
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      const cols = Math.ceil(w / WARP_GAP) + 2;
      const rows = Math.ceil(h / WEFT_GAP) + 2;

      // A slow lateral drift, so the cloth is never quite still.
      const drift = Math.sin(t * 0.16) * 7;
      const sag = Math.cos(t * 0.11) * 5;

      const xOf = (c: number) => c * WARP_GAP + drift;
      const yOf = (r: number) => r * WEFT_GAP + sag;

      // The shuttle: one weft row lit at a time, travelling left to right,
      // then the next row down. This is the motion of an actual loom.
      const CROSS = 9; // seconds per pass
      const pass = t / CROSS;
      // Offset to the middle of the panel. Starting at row 0 put the first
      // nine seconds — the only nine seconds most people see — half off the
      // top edge, which is the one moment the effect had to land.
      const shuttleRow =
        (Math.floor(pass) + Math.floor(rows / 2)) % Math.max(1, rows);
      const shuttleX = (pass % 1) * (w + 260) - 130;

      ctx.lineCap = "round";

      // ── 1. warp — the threads held on the loom, vertical ────────────────
      ctx.strokeStyle = palette.thread;
      ctx.globalAlpha = 0.1 * palette.lift;
      ctx.lineWidth = 1;
      for (let c = 0; c < cols; c += 1) {
        const x = xOf(c);
        ctx.beginPath();
        ctx.moveTo(x, -WEFT_GAP);
        ctx.lineTo(x, h + WEFT_GAP);
        ctx.stroke();
      }

      // ── 2. weft — the thread the shuttle carries, horizontal ────────────
      for (let r = 0; r < rows; r += 1) {
        const y = yOf(r);
        // Rows near the shuttle are brighter, and the effect falls away over
        // three rows, so the light looks like it belongs to the pass rather
        // than being switched on and off.
        const near = Math.max(0, 1 - Math.abs(r - shuttleRow) / 3);
        ctx.globalAlpha = (0.08 + near * 0.1) * palette.lift;
        ctx.beginPath();
        ctx.moveTo(-WARP_GAP, y);
        ctx.lineTo(w + WARP_GAP, y);
        ctx.stroke();
      }

      // ── 3. THE INTERLACE — warp repainted over weft on alternate crossings
      // Without this the weft sits on top everywhere and the whole thing reads
      // as a grid. This pass is what makes it cloth.
      ctx.globalAlpha = 0.13 * palette.lift;
      for (let c = 0; c < cols; c += 1) {
        const x = xOf(c);
        for (let r = 0; r < rows; r += 1) {
          if ((c + r) % 2 !== 0) continue;
          const y = yOf(r);
          ctx.beginPath();
          ctx.moveTo(x, y - WEFT_GAP * 0.34);
          ctx.lineTo(x, y + WEFT_GAP * 0.34);
          ctx.stroke();
        }
      }

      // ── 4. the shuttle itself — a short bright run of thread ─────────────
      const y = yOf(shuttleRow);
      const grad = ctx.createLinearGradient(
        shuttleX - 130,
        0,
        shuttleX + 40,
        0,
      );
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.75, palette.thread);
      grad.addColorStop(1, "transparent");
      ctx.strokeStyle = grad;
      // A THIRD of the lift, not all of it. The threads need the boost on
      // white; the shuttle does not, and at full lift it painted an opaque
      // line across whatever text it passed.
      ctx.globalAlpha = Math.min(0.62, 0.55 * (1 + (palette.lift - 1) * 0.3));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(shuttleX - 130, y);
      ctx.lineTo(shuttleX + 40, y);
      ctx.stroke();

      // The bobbin — a small bright head where the shuttle is now.
      ctx.globalAlpha = Math.min(0.9, 0.85 * (1 + (palette.lift - 1) * 0.3));
      ctx.fillStyle = palette.thread;
      ctx.beginPath();
      ctx.arc(shuttleX + 26, y, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
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
      if (reduced.matches) {
        // One frame, at a moment that happens to look composed, and stop.
        draw(3.2);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    begin();
    reduced.addEventListener("change", begin);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      themeWatcher.disconnect();
      reduced.removeEventListener("change", begin);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      // Decorative. The panel it sits behind carries the words, so a screen
      // reader loses nothing by never being told this exists.
      className={className}
    />
  );
}
