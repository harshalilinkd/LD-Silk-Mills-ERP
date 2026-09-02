"use client";

// DraggablePanel — docs/SCREENS.md §7.2.1
//
// The floating detail window the follow-up panel lives in. A window, not a
// drawer, so the queue underneath stays visible and reachable while a call is
// worked.
//
// Behaviour, matched to the spec:
//   * **Centred and 1080px wide** until it is dragged, then explicit {left,top}.
//     It was once pinned top-right at 560px, which on a wide screen put a tall
//     form in the corner with the two-column sections wrapping and the ratings
//     below the fold.
//   * Drag by the header; **double-click the header to snap back**.
//   * Clamped so a grabbable strip always stays on screen whichever way it is
//     dragged.
//   * Esc closes.
//   * `tinted` gives the header a soft vertical WASH rather than a flat fill,
//     so it reads as the top of a sheet instead of a coloured strip.
//
// Colours are this app's tokens (docs/DESIGN.md): the spec's `line-strong` →
// `border-strong`, `accent-soft` → `--accent` (already a translucent wash in
// both themes), `accent-deep` → `--accent-text`.
//
// It lives in the CRM folder rather than components/ui/ because CRM is its only
// caller here; the order tracker's floating panel is a separate, shipped
// implementation and rewiring it would mean re-testing it for no gain.

import * as React from "react";
import { IconGripHorizontal, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export function DraggablePanel({
  title,
  subtitle,
  headerAside,
  onClose,
  footer,
  children,
  className,
  tinted = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Sits right of the title, left of the close button — status, a value, a count. */
  headerAside?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Tint the title bar with the accent wash (the CRM call panel does). */
  tinted?: boolean;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const dragOffset = React.useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function startDrag(e: React.PointerEvent) {
    const el = panelRef.current;
    if (!el || e.button !== 0) return;
    // Never start a drag from a control inside the bar. setPointerCapture below
    // redirects every subsequent pointer event to the header, so without this
    // the close button never receives its click and the panel cannot be shut.
    if ((e.target as HTMLElement).closest("button")) return;
    const r = el.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setPos({ x: r.left, y: r.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    const off = dragOffset.current;
    const el = panelRef.current;
    if (!off || !el) return;
    const r = el.getBoundingClientRect();
    // Keep a grabbable strip on screen whichever way it is dragged.
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 48;
    setPos({
      x: Math.min(Math.max(e.clientX - off.dx, 80 - r.width), maxX),
      y: Math.min(Math.max(e.clientY - off.dy, 8), maxY),
    });
  }

  function endDrag() {
    dragOffset.current = null;
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={false}
      onPointerMove={onDragMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={
        pos
          ? { left: pos.x, top: pos.y }
          : { left: "50%", top: "6rem", transform: "translateX(-50%)" }
      }
      className={cn(
        "fixed z-30 flex max-h-[calc(100vh-9rem)] w-[min(96vw,1080px)] flex-col overflow-hidden",
        "rounded-card border border-border-strong bg-surface",
        "shadow-[0_24px_64px_-16px_rgba(16,20,40,0.35),0_2px_8px_rgba(16,20,40,0.10)] ring-1 ring-black/[0.03]",
        className,
      )}
    >
      <div
        onPointerDown={startDrag}
        onDoubleClick={() => setPos(null)}
        title="Drag to move · double-click to snap back"
        className={cn(
          "flex cursor-grab touch-none items-center gap-3 border-b border-border px-5 py-3.5 select-none active:cursor-grabbing",
          // A soft vertical wash rather than a flat fill.
          tinted &&
            "bg-gradient-to-b from-accent to-[color-mix(in_oklab,var(--accent)_55%,var(--surface))]",
        )}
      >
        <IconGripHorizontal
          className={cn(
            "size-4 shrink-0 opacity-60",
            tinted ? "text-accent-text" : "text-text-3",
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]",
              tinted ? "text-accent-text" : "text-text-1",
            )}
          >
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-[11.5px] text-text-3">
              {subtitle}
            </div>
          ) : null}
        </div>
        {headerAside ? (
          <div className="flex shrink-0 items-center gap-2">{headerAside}</div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text-1"
        >
          <IconX className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      {footer ? (
        <div className="flex items-center gap-2 border-t border-border bg-surface-2/80 px-5 py-3 backdrop-blur-sm">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
