import Link from "next/link";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
} from "@tabler/icons-react";

import { auth } from "@/auth";
import { PasswordFallbackNotice } from "@/components/shell/password-fallback-notice";
import { getOperationalSnapshot, type Tone } from "@/lib/dashboard-brain";
import { getDashboardCounts, getVisibleSystemsForUser } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The home page: what is waiting, then how the ERP itself is doing
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It used to be four tiles about the SHELL — systems configured, user rows,
 * modules queued — over a panel that said "no activity yet, once Phase 2 wires
 * up authentication". Phase 2 shipped weeks ago and the audit table has had
 * rows in it since. Nothing on the page was a thing anybody could do anything
 * about, and the first screen everybody opens is the wrong place for that.
 *
 * The order is the order somebody asks: **what needs me** (figures, then the
 * exceptions with a link straight to the screen that clears them), then
 * **what has been happening**, then **is everything up** — which is the old
 * page, kept, because it is genuinely the view of the system and it is where
 * you look when a module misbehaves.
 *
 * ── MOBILE IS TWO TILES A ROW, NOT ONE ───────────────────────────────────
 *
 * At 390px the old cards were one per row at 18px padding with a 26px figure,
 * so four of them filled a phone screen before a single word of content. They
 * are `grid-cols-2` from the smallest width up, with the padding and the
 * figure stepped down to match: six tiles now cost three short rows instead of
 * six tall ones, and the panels below start above the fold.
 */

const TONE_RING: Record<Tone, string> = {
  neutral: "text-text-1",
  good: "text-status-green",
  warn: "text-status-amber",
  bad: "text-status-red",
};

function Tile({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-card border border-border bg-surface p-3 transition-colors hover:border-primary/40 sm:p-4"
    >
      {/*
        BLACK, and 11px rather than 10.5.

        `--text-3` is for genuinely secondary text — a timestamp, a hint. A KPI
        LABEL is not secondary: it is the only thing saying what the number
        underneath it means, and the sub-line under that carries its
        denominator, which this ERP treats as part of the figure rather than a
        footnote. Both were grey at 10.5px and the owner reported the page as
        unreadable. Hierarchy here comes from the 19px bold figure between
        them, not from fading the words that explain it.
      */}
      <div className="truncate text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "num mt-1.5 truncate text-[19px] leading-none font-bold tracking-[-0.02em] sm:text-[22px]",
          TONE_RING[tone],
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-[11.5px] leading-snug text-text-2">
        {sub}
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? null;

  // The same resolution the sidebar does, reused rather than repeated — it is
  // what decides which figures this person is allowed to be shown at all.
  const visible = userId ? await getVisibleSystemsForUser(userId) : [];
  const codes = new Set(
    visible.filter((s) => s.status === "active").map((s) => s.systemCode),
  );

  const snapshot = await getOperationalSnapshot(codes, email);
  const { systems } = await getDashboardCounts();

  const clear = snapshot.attention.length === 0 && snapshot.tiles.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-text-2">
          What is waiting across LD Silk Mills, in the modules you can open.
        </p>
      </div>

      <PasswordFallbackNotice />

      {/* ── the figures ───────────────────────────────────────────────── */}
      {snapshot.tiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
          {snapshot.tiles.map((t) => (
            <Tile key={`${t.code}-${t.label}`} {...t} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface px-4 py-8 text-center text-[13px] text-text-2">
          No modules have been granted to your account yet. Settings → Access is
          where somebody adds them.
        </div>
      )}

      {/* ── what needs somebody ───────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-surface">
        <div className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
              Needs attention
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              Right now, across your modules
            </h2>
          </div>
          {snapshot.attention.length > 0 ? (
            <span className="shrink-0 rounded-pill bg-status-amber-dim px-2 py-0.5 text-[11px] font-semibold text-status-amber">
              {snapshot.attention.length}
            </span>
          ) : null}
        </div>

        {snapshot.attention.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-6">
            <IconCircleCheck
              className={cn(
                "size-5 shrink-0",
                clear ? "text-status-green" : "text-text-3",
              )}
            />
            <p className="text-[13px] text-text-2">
              {clear
                ? "Nothing is waiting. Every chase list across your modules is empty."
                : "Nothing to show yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {snapshot.attention.map((a) => (
              <li key={`${a.code}-${a.title}`}>
                <Link
                  href={a.href}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <IconAlertTriangle
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      a.tone === "bad" ? "text-status-red" : "text-status-amber",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-text-1">
                      {a.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-text-2">
                      {a.detail}
                    </span>
                  </span>
                  <IconArrowRight className="mt-0.5 size-4 shrink-0 text-text-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
        {/* ── what has been happening ─────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
              Recent activity
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              From the audit log
            </h2>
          </div>
          {snapshot.activity.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-6">
              <IconActivity className="size-5 shrink-0 text-text-3" />
              <p className="text-[13px] text-text-2">
                Nothing recorded yet. Entries appear here as people record and
                change things.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {snapshot.activity.map((a, i) => (
                <li
                  key={`${a.at}-${a.what}-${i}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="num w-[74px] shrink-0 text-[11px] text-text-2">
                    {a.at}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-1">
                    {a.what}
                  </span>
                  <span className="max-w-[38%] shrink-0 truncate text-[11.5px] text-text-2">
                    {a.who}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── is everything up ────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase">
              System status
            </div>
            <h2 className="mt-0.5 text-[14.5px] font-bold text-text-1">
              From the live system registry
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {systems.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2.5 px-4 py-2 sm:gap-3"
              >
                <span
                  className={cn(
                    "size-[7px] shrink-0 rounded-full",
                    s.status === "active"
                      ? "bg-status-green shadow-[0_0_0_3px_var(--status-green-dim)]"
                      : "bg-text-3",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-1">
                  {s.systemName}
                </span>
                <span className="hidden shrink-0 text-[11px] capitalize text-text-3 sm:block">
                  {s.category}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold",
                    s.status === "active"
                      ? "bg-status-green-dim text-status-green"
                      : "bg-chip text-text-3",
                  )}
                >
                  {s.status === "active" ? "Active" : "Coming soon"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
