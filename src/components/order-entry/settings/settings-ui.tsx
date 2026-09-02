"use client";

// Small shared building blocks for the six Order Entry Settings tabs. Every
// tab is a client island that talks to /api/order-entry/* directly (the
// settings routes are all guarded server-side, and the tab shell in
// app/(app)/order-entry/settings/layout.tsx already redirects non-admins), so
// the pieces they all need — a JSON fetch wrapper, panel/table/input classes,
// an error banner and a confirm dialog — live here rather than being copied
// six times.
import type { ComponentType, ReactNode } from "react";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * One-liner around the `{ data } | { error }` envelope every
 * /api/order-entry route returns. Never throws — callers branch on `ok` and
 * render `error` inline, which is what the settings screens want.
 */
export async function apiJson<T>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers:
        init?.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const body = (await res.json().catch(() => null)) as {
      data?: T;
      error?: string;
    } | null;
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: body?.data as T };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

// ---------------------------------------------------------------------------
// Shared class names (docs/DESIGN.md tokens only)
// ---------------------------------------------------------------------------

export const PANEL_CLS = "rounded-[10px] border border-border bg-surface";

export const INPUT_CLS =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 text-[13px] text-text-1 outline-none transition-colors placeholder:text-text-3 focus-visible:border-border-strong disabled:opacity-50";

export const LABEL_CLS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3";

export const TH_CLS =
  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1";

export const TD_CLS = "border-b border-border px-3.5 py-2.5 text-text-2";

/** 17×17 rounded checkbox with the brand-teal checked fill (DESIGN.md § Tables). */
export const CHECKBOX_CLS =
  "size-[17px] shrink-0 cursor-pointer rounded-[5px] accent-primary disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn(PANEL_CLS, "flex flex-col", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-[18px] py-3.5">
          <div>
            {title && (
              <h2 className="text-[14.5px] font-bold text-text-1">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-[11.5px] text-text-3">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={cn("px-[18px] py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red">
      <IconAlertTriangle className="mt-px size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function NoticeBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-status-green/30 bg-status-green-dim px-3 py-2 text-[12.5px] text-status-green">
      {message}
    </div>
  );
}

export function LoadingRow({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-text-3">
      <IconLoader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyRow({
  icon: Icon,
  title,
  description,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-5 py-11 text-center">
      {Icon && <Icon className="size-[30px] text-text-3" />}
      <p className="text-[13.5px] font-semibold text-text-2">{title}</p>
      {description && (
        <p className="max-w-[280px] text-xs text-text-3">{description}</p>
      )}
    </div>
  );
}

/** Neutral / green / red / amber pill, matching DESIGN.md's status badge. */
export function Pill({
  tone = "neutral",
  children,
  title,
  className,
}: {
  tone?: "neutral" | "green" | "red" | "amber" | "accent";
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-chip text-text-3",
    green: "bg-status-green-dim text-status-green",
    red: "bg-status-red-dim text-status-red",
    amber: "bg-status-amber-dim text-status-amber",
    accent: "bg-accent text-accent-text",
  };
  return (
    <span
      title={title}
      className={cn(
        "shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete permanently",
  busyLabel = "Working…",
  busy = false,
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// NOTE: there is deliberately no Pager here. §0.4 says not to hand-roll one —
// Design Database uses the shared `@/components/ui/pager`, the same control
// (Previous · typed page box · Next) as Orders, Order status and Tracking.
