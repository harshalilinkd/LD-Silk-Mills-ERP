import Image from "next/image";
import { redirect } from "next/navigation";
import {
  IconBuildingFactory2,
  IconChartBar,
  IconClipboardList,
  IconLock,
  IconMail,
  IconSettings,
  IconShieldCheck,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";

import { auth } from "@/auth";
import { PasswordInput } from "@/components/ui/password-input";
import { signInWithGoogle, signInWithPassword } from "./actions";
import loginBackdrop from "../../../public/login-bg.jpg";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sign in
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ONE layout, one component tree, one token set — see `.ld-auth` in
 * globals.css. There is no separate mobile implementation and there must not
 * be: the difference between a phone and a 4K monitor here is which of two
 * grid columns exist and what a handful of `clamp()`s resolve to. Two trees
 * means two things to keep in step, and they never stay in step.
 *
 * ── THE PHOTOGRAPH ────────────────────────────────────────────────────────
 *
 * `login.png` at the repo root is the supplied master, 1536x1024 (3:2).
 * `public/login-bg.jpg` is generated from it and is what ships.
 *
 * Two faults were fixed there, both arithmetic rather than taste:
 *
 *  · BLUR. A 1536px-wide file stretched across a 1904px viewport is a 1.25x
 *    upscale — every source pixel smeared over 1.56 screen pixels (2.8 on a
 *    2560 monitor). The shipped file is upscaled to 2200px with lanczos3 and
 *    an unsharp mask, so the browser now paints it at ~1.0x.
 *
 *  · CROP. Screens are 1.78-2.10:1. `object-cover` on a 3:2 source slices
 *    8-14% off the TOP and BOTTOM — exactly where the loom sits (top right)
 *    and the cotton bolls sit (bottom left). No `object-position` saves both;
 *    they are at opposite extremes. So the whole photograph is centred
 *    UNCROPPED inside a 3008x1467 (2.05:1) frame, with ~404px each side built
 *    from the subject's own edge colour blended with a blurred zoomed copy —
 *    colour continuity kills the seam, organic structure kills the banding.
 *    The page then dissolves both far edges into warm light.
 *
 * Never point this page straight at a 3:2 file again; that is what caused
 * both complaints.
 *
 * ── MOTION ────────────────────────────────────────────────────────────────
 *
 * All of it is on the PHOTOGRAPH and none of it is on the form, which is the
 * line that keeps "premium" from becoming "flashy": the cloth breathes
 * (`ld-drape`, 42s), light crosses it (`ld-sheen`, 9s), the room's light
 * drifts (`ld-sun`, 26s). The interface itself only responds to you — a field
 * takes a teal ring on focus, the CTA lifts and its arrow travels on hover.
 * Every one stops under `prefers-reduced-motion`.
 *
 * The decorative rings around the card's mark are gone. A mark is a mark.
 *
 * ── ONE HONEST DEPARTURE ──────────────────────────────────────────────────
 *
 * "Forgot password?" is in the design and is rendered, but this ERP sends no
 * email and has no reset flow. A link that goes nowhere is worse than no
 * link, so it expands a sentence saying what actually works. `<details>`, so
 * it works before hydration.
 *
 * ── NOT TOUCHED ───────────────────────────────────────────────────────────
 *
 * Both <form>s still post to the same two server actions with the same field
 * names. No auth logic, no API, no database, no submission behaviour changed
 * here — this file is markup and styling.
 */

/** Fine photographic grain, inline so it costs no request. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** What the ERP actually contains. Labels only — no cards, no boxes. */
const CAPABILITIES = [
  { label: "Orders", Icon: IconClipboardList },
  { label: "Operations", Icon: IconSettings },
  { label: "CRM", Icon: IconUsers },
  { label: "Production", Icon: IconBuildingFactory2 },
  { label: "Reports", Icon: IconChartBar },
  { label: "Team", Icon: IconUsersGroup },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { callbackUrl, error } = await searchParams;

  return (
    <div className="ld-auth relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-[#e9dfcd]">
      {/* ═══ the cloth ════════════════════════════════════════════════ */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="ld-drape absolute inset-0 will-change-transform">
          <Image
            src={loginBackdrop}
            alt=""
            fill
            priority
            placeholder="blur"
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>

        {/* the room's light, drifting */}
        <div
          className="ld-sun absolute inset-0 will-change-transform"
          style={{
            background:
              "radial-gradient(56% 66% at 34% 20%, rgba(255,242,216,0.40) 0%, rgba(255,242,216,0.16) 44%, rgba(255,242,216,0) 74%)",
          }}
        />

        {/* light crossing silk — warm, because window light is not grey */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="ld-sheen absolute -inset-y-1/3 left-0 w-[34%] rotate-[15deg] blur-[2px] will-change-transform"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,248,232,0) 0%, rgba(255,248,232,0.14) 38%, rgba(255,252,244,0.34) 50%, rgba(255,248,232,0.14) 62%, rgba(255,248,232,0) 100%)",
            }}
          />
        </div>

        <div
          className="absolute inset-0 opacity-[0.055] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        {/* Readability scrim. Two stops, because the requirement differs by
            width: on a phone the card sits over the middle of the cloth and
            needs a wash everywhere; on a desktop only the headline column
            does, and washing the rest would flatten the photograph. */}
        <div
          className="absolute inset-0 md:hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(250,246,238,0.72) 0%, rgba(250,246,238,0.58) 42%, rgba(250,246,238,0.66) 100%)",
          }}
        />
        <div
          className="absolute inset-0 max-md:hidden"
          style={{
            background:
              "linear-gradient(102deg, rgba(250,246,238,0.46) 0%, rgba(250,246,238,0.30) 26%, rgba(250,246,238,0.08) 46%, rgba(250,246,238,0) 60%)",
          }}
        />

        {/* A light POOL, not more scrim. The brand column grew a strapline and
            a six-item capability row, and both sat past where the linear scrim
            still had any strength — measured, the "Team" label came in at
            1.87:1 against mid-tone teal weave and the strapline at 4.36:1.
            Turning the linear scrim up would fix them and wash the leaves back
            out, which is the complaint it was halved for in the first place.
            An ellipse centred on the text block instead: strongest exactly
            where the words are, near zero at the top-left where the leaves
            are, and gone entirely by the middle of the frame. */}
        <div
          className="absolute inset-0 max-md:hidden"
          style={{
            background:
              "radial-gradient(72% 52% at 21% 63%, rgba(251,248,241,0.72) 0%, rgba(251,248,241,0.40) 48%, rgba(251,248,241,0.12) 76%, rgba(251,248,241,0) 100%)",
          }}
        />

        {/* the widened frame dissolving into warm light at both far edges */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(247,241,229,0.62) 0%, rgba(247,241,229,0) 9%, rgba(247,241,229,0) 90%, rgba(247,241,229,0.55) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(125% 95% at 50% 45%, rgba(46,42,32,0) 46%, rgba(46,42,32,0.17) 100%)",
          }}
        />
      </div>

      {/* ═══ content ══════════════════════════════════════════════════ */}
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-[clamp(16px,3vw,48px)] py-[clamp(18px,2.4vh,30px)]">
        <header
          className="ld-reveal flex shrink-0 items-center gap-3"
          style={{ "--ld-reveal-delay": "0ms" } as React.CSSProperties}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[var(--auth-teal-deep)] text-[15px] font-bold tracking-wide text-white shadow-[0_6px_18px_rgba(13,79,74,0.32)] md:size-11 md:rounded-[12px] md:text-base">
            LD
          </span>
          <span className="text-[17px] font-bold tracking-[-0.02em] text-[var(--auth-ink)] md:text-[21px]">
            LD Silk Mills ERP
          </span>
        </header>

        <main className="grid flex-1 items-center gap-8 py-6 md:grid-cols-[1fr_minmax(0,clamp(340px,37vw,440px))] md:gap-[clamp(36px,4.5vw,64px)] md:py-8">
          {/* ═══ brand ═══════════════════════════════════════════════ */}
          <section className="max-w-[600px]">
            <h1
              className="ld-reveal font-[family-name:var(--font-display)] text-[clamp(28px,7.2vw,32px)] leading-[1.1] font-normal tracking-[-0.015em] text-[var(--auth-ink)] md:text-[clamp(32px,4.4vw,54px)]"
              style={{ "--ld-reveal-delay": "90ms" } as React.CSSProperties}
            >
              Weave every thread.
              <br />
              <span className="text-[var(--auth-teal)]">Power</span> every
              process.
            </h1>

            <div
              className="ld-thread mt-4 h-[3px] w-14 rounded-full bg-gradient-to-r from-[var(--auth-teal)] to-[var(--auth-teal)]/25 md:mt-6 md:w-16"
              style={{ "--ld-reveal-delay": "420ms" } as React.CSSProperties}
            />

            {/* Below md the brand column yields the screen to the form. The
                strapline and the capability row are the first things to go —
                somebody on a phone is here to get in, not to be sold to. */}
            <p
              className="ld-reveal mt-5 hidden text-[15px] text-[var(--auth-ink-3)] md:block md:text-base"
              style={{ "--ld-reveal-delay": "520ms" } as React.CSSProperties}
            >
              One workspace for your entire textile operation.
            </p>

            <ul
              className="ld-reveal mt-7 hidden flex-wrap gap-x-[clamp(24px,2.4vw,36px)] gap-y-5 md:flex"
              style={{ "--ld-reveal-delay": "600ms" } as React.CSSProperties}
            >
              {CAPABILITIES.map(({ label, Icon }) => (
                <li key={label} className="flex flex-col items-center gap-1.5">
                  <Icon
                    className="size-[22px] text-[var(--auth-teal)]"
                    stroke={1.5}
                  />
                  <span className="text-[12.5px] font-medium text-[var(--auth-ink-2)]">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ═══ the card ════════════════════════════════════════════ */}
          <section
            className="ld-settle relative w-full justify-self-center rounded-[20px] border border-[var(--auth-card-edge)] p-[clamp(20px,2.2vw,32px)] shadow-[var(--auth-shadow-card)] backdrop-blur-[18px] backdrop-saturate-150 md:rounded-[var(--auth-r-card)] md:justify-self-end"
            style={
              {
                "--ld-reveal-delay": "260ms",
                // Warm cream cooling very slightly toward sage — the
                // photograph's own gradient, which is what makes the card read
                // as part of the scene rather than pasted onto it.
                backgroundImage:
                  "linear-gradient(168deg, rgba(253,250,244,0.94) 0%, rgba(250,247,240,0.90) 48%, rgba(240,241,234,0.88) 100%)",
              } as React.CSSProperties
            }
          >
            <span
              aria-hidden
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.035] mix-blend-multiply"
              style={{ backgroundImage: GRAIN }}
            />

            <div className="relative flex justify-center">
              <span className="grid size-[52px] place-items-center rounded-[15px] bg-gradient-to-br from-[#12594f] to-[var(--auth-teal-deep)] text-[17px] font-bold tracking-wide text-white shadow-[0_10px_24px_rgba(13,79,74,0.36)] md:size-14 md:text-lg">
                LD
              </span>
            </div>

            <h2 className="relative mt-4 text-center text-[21px] font-bold tracking-[-0.02em] text-[var(--auth-ink)] md:text-[25px]">
              Welcome back
            </h2>
            <p className="relative mt-1 text-center text-[13px] text-[var(--auth-ink-3)] md:text-sm">
              Sign in to continue to LD Silk Mills ERP
            </p>

            {error === "invalid_credentials" && (
              <p
                role="alert"
                className="relative mt-4 rounded-xl border border-[#b8403a]/30 bg-[#b8403a]/10 px-3.5 py-2 text-[12.5px] text-[#993029]"
              >
                That email and password didn&apos;t work. If you have never set
                one, continue with Google instead.
              </p>
            )}

            <form
              action={async () => {
                "use server";
                await signInWithGoogle(callbackUrl);
              }}
              className="relative mt-5"
            >
              <button
                type="submit"
                className="group flex h-[var(--auth-tap)] w-full cursor-pointer items-center justify-center gap-3 rounded-[var(--auth-r-field)] border border-[var(--auth-field-edge)] bg-white/95 text-[14.5px] font-semibold text-[var(--auth-ink)] shadow-[0_1px_2px_rgba(20,49,47,0.06)] transition-[background-color,box-shadow,border-color] duration-200 hover:border-[#cfc3ac] hover:bg-white hover:shadow-[0_5px_14px_rgba(20,49,47,0.10)]"
              >
                <GoogleIcon className="size-[18px]" />
                Continue with Google
              </button>
            </form>

            <div className="relative my-5 flex items-center gap-4">
              <span className="h-px flex-1 bg-[var(--auth-ink)]/12" />
              <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--auth-ink-3)]">
                OR
              </span>
              <span className="h-px flex-1 bg-[var(--auth-ink)]/12" />
            </div>

            <form
              action={async (formData: FormData) => {
                "use server";
                await signInWithPassword(
                  String(formData.get("email") ?? ""),
                  String(formData.get("password") ?? ""),
                  callbackUrl,
                );
              }}
              className="relative flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="auth-email"
                  className="text-[12.5px] font-semibold text-[var(--auth-ink-2)]"
                >
                  Email
                </label>
                <div className="relative">
                  <IconMail
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 text-[var(--auth-teal)]/70"
                    stroke={1.7}
                  />
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="you@example.com"
                    required
                    className="auth-field"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="auth-password"
                  className="text-[12.5px] font-semibold text-[var(--auth-ink-2)]"
                >
                  Password
                </label>
                <div className="relative">
                  <IconLock
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-[17px] -translate-y-1/2 text-[var(--auth-teal)]/70"
                    stroke={1.7}
                  />
                  {/* No `minLength`. This field proves you know an EXISTING
                      password; the length rule belongs where one is CHOSEN, in
                      Settings. Gating it here would lock out anyone holding a
                      password set under an older rule. */}
                  <PasswordInput
                    id="auth-password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="•••••••••••••"
                    required
                    className="auth-field"
                  />
                </div>
              </div>

              <details className="-mt-1 self-end">
                <summary className="cursor-pointer list-none rounded text-[12.5px] font-medium text-[var(--auth-teal)] underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                  Forgot password?
                </summary>
                <p className="mt-2 max-w-[38ch] rounded-lg bg-[var(--auth-teal)]/10 px-3 py-2 text-right text-[12px] leading-relaxed text-[var(--auth-ink-3)]">
                  There is no reset email. Ask an ERP administrator — they can
                  set a new one for you from Settings in a few seconds.
                </p>
              </details>

              <button
                type="submit"
                className="group relative flex h-[52px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[var(--auth-r-field)] bg-gradient-to-r from-[var(--auth-teal-deep)] via-[#0d554e] to-[var(--auth-teal-lift)] text-[15px] font-semibold text-white shadow-[var(--auth-shadow-cta)] transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[var(--auth-shadow-cta-hover)] active:translate-y-0 motion-reduce:hover:translate-y-0"
              >
                <span className="relative">Sign in</span>
                <span
                  aria-hidden
                  className="absolute inset-y-0 right-0 grid w-[52px] place-items-center border-l border-white/15 bg-white/10"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-[18px] transition-transform duration-200 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                  >
                    <path
                      d="M4 12h15m0 0-6-6m6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            </form>

            <div className="relative mt-5 flex items-start gap-2.5 border-t border-[var(--auth-ink)]/10 pt-4">
              <IconShieldCheck
                aria-hidden
                className="mt-px size-[17px] shrink-0 text-[var(--auth-teal)]"
                stroke={1.7}
              />
              <p className="text-[12px] leading-relaxed text-[var(--auth-ink-3)]">
                <span className="font-semibold text-[var(--auth-ink-2)]">
                  Enterprise-grade security
                </span>
                <br />
                Your account and data are securely protected.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.29A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
