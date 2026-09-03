import { existsSync } from "node:fs";
import path from "node:path";

import { redirect } from "next/navigation";
import {
  IconChartBar,
  IconClipboardList,
  IconFileDescription,
  IconLock,
  IconMail,
  IconSettings,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";

import { auth } from "@/auth";
import { PasswordInput } from "@/components/ui/password-input";
import { SilkBackdrop } from "./silk-backdrop";
import { signInWithGoogle, signInWithPassword } from "./actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sign in — the approved design, built.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Full-bleed fabric, the brand and the promise on the left, one card on the
 * right. Every element of the mockup is here: the wordmark, the two-line serif
 * headline with `Power` in teal, the rule, the five module tiles, the trust
 * pill, the ringed emblem, both sign-in methods, the security note and the
 * browser row.
 *
 * ── THE PHOTOGRAPH ────────────────────────────────────────────────────────
 *
 * Drop the real image at `public/login-bg.jpg` and it is used automatically.
 * The check is at MODULE scope, so it costs one `existsSync` per server start
 * rather than one per request. Until the file exists, `SilkBackdrop` draws
 * generated drapery in the same palette — so adding it changes the texture and
 * nothing else about the layout.
 *
 * ── MOTION ────────────────────────────────────────────────────────────────
 *
 * Gentle, and never more than one thing moving at once:
 *   · the drape breathes over ~90s (canvas)
 *   · the emblem's ring turns once every 40s
 *   · content arrives on a stagger, left column first
 *   · fields lift their ring on focus, tiles lift on hover, the submit arrow
 *     travels on hover
 * All of it sits behind `prefers-reduced-motion`.
 *
 * ── ONE HONEST DEPARTURE ──────────────────────────────────────────────────
 *
 * "Forgot password?" is in the design and is rendered, but this ERP has no
 * reset flow — there is no outbound email anywhere in it, and a reset link
 * that goes nowhere is worse than no link. It expands a sentence saying what
 * actually works. `<details>` rather than script, so it works before
 * hydration.
 */

const BG = path.join(process.cwd(), "public", "login-bg.jpg");
const HAS_PHOTO = existsSync(BG);

const MODULES = [
  { label: "Order Entry", Icon: IconClipboardList },
  { label: "Operations", Icon: IconSettings },
  { label: "CRM", Icon: IconUsers },
  { label: "Help Slip", Icon: IconFileDescription },
  { label: "Reports", Icon: IconChartBar },
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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#efe7da]">
      {/* ═══ the fabric ═══════════════════════════════════════════════ */}
      {HAS_PHOTO ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/login-bg.jpg)" }}
        />
      ) : (
        <SilkBackdrop className="absolute inset-0 size-full" />
      )}

      {/* Warm scrim. The headline is near-black on cloth that is bright in
          places and dark in others, so the left third gets a soft lift —
          without it the serif sits on cream in one spot and teal in another. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(252,249,243,0.88) 0%, rgba(252,249,243,0.58) 34%, rgba(252,249,243,0.12) 58%, rgba(252,249,243,0) 72%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-6 py-8 lg:px-12 lg:py-10">
        {/* ═══ wordmark ═══════════════════════════════════════════════ */}
        <header
          className="ld-reveal flex items-center gap-3.5"
          style={{ "--ld-reveal-delay": "0ms" } as React.CSSProperties}
        >
          <span className="grid size-[52px] place-items-center rounded-[14px] bg-[#0d4f4a] text-[17px] font-bold tracking-wide text-white shadow-[0_6px_20px_rgba(13,79,74,0.30)]">
            LD
          </span>
          <span className="text-[22px] font-bold tracking-[-0.02em] text-[#123331]">
            LD Silk Mills ERP
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1.15fr_minmax(0,520px)] lg:gap-16 lg:py-4">
          {/* ═══ the promise ══════════════════════════════════════════ */}
          <section className="max-w-[560px]">
            <h1
              className="ld-reveal font-[family-name:var(--font-display)] text-[clamp(36px,4.6vw,58px)] leading-[1.08] font-normal tracking-[-0.015em] text-[#14312f]"
              style={{ "--ld-reveal-delay": "80ms" } as React.CSSProperties}
            >
              Weave every thread.
              <br />
              <span className="text-[#0d6b62]">Power</span> every process.
            </h1>

            <div
              className="ld-reveal mt-7 h-[3px] w-14 rounded-full bg-[#0d6b62]"
              style={{ "--ld-reveal-delay": "160ms" } as React.CSSProperties}
            />

            <p
              className="ld-reveal mt-6 max-w-[42ch] text-[16px] leading-relaxed text-[#3d4f4d]"
              style={{ "--ld-reveal-delay": "220ms" } as React.CSSProperties}
            >
              A unified ERP that connects orders, operations, people and
              performance — seamlessly.
            </p>

            <ul className="mt-9 flex flex-wrap gap-3">
              {MODULES.map(({ label, Icon }, i) => (
                <li
                  key={label}
                  className="ld-reveal flex w-[92px] flex-col items-center gap-2 rounded-[14px] border border-white/70 bg-white/80 px-3 py-3.5 shadow-[0_4px_16px_rgba(20,49,47,0.07)] backdrop-blur-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_10px_26px_rgba(20,49,47,0.14)] motion-reduce:hover:translate-y-0"
                  style={
                    {
                      "--ld-reveal-delay": `${300 + i * 70}ms`,
                    } as React.CSSProperties
                  }
                >
                  <Icon className="size-[22px] text-[#0d6b62]" stroke={1.6} />
                  <span className="text-center text-[12px] font-medium text-[#2a423f]">
                    {label}
                  </span>
                </li>
              ))}
            </ul>

            <div
              className="ld-reveal mt-10 inline-flex items-center gap-2.5 rounded-full bg-[#16302e]/85 px-5 py-3 backdrop-blur-sm"
              style={{ "--ld-reveal-delay": "700ms" } as React.CSSProperties}
            >
              <IconShieldCheck
                className="size-[18px] text-[#8fd6c9]"
                stroke={1.7}
              />
              <span className="text-[13.5px] font-medium text-white/90">
                Secure. Reliable. Built for textile.
              </span>
            </div>
          </section>

          {/* ═══ the card ═════════════════════════════════════════════ */}
          <section
            className="ld-reveal w-full justify-self-center rounded-[26px] border border-white/70 bg-[#faf7f2]/92 p-7 shadow-[0_28px_70px_rgba(20,49,47,0.22)] backdrop-blur-xl sm:p-9 lg:justify-self-end"
            style={{ "--ld-reveal-delay": "140ms" } as React.CSSProperties}
          >
            {/* The ringed emblem. The ring turns once every 40 seconds — slow
                enough to read as "alive" rather than as a spinner saying
                "wait". */}
            <div className="flex justify-center">
              <div className="relative grid size-[104px] place-items-center">
                <span
                  aria-hidden
                  className="ld-orbit absolute inset-0 rounded-full border border-dashed border-[#0d4f4a]/25"
                />
                <span
                  aria-hidden
                  className="absolute inset-[11px] rounded-full border border-[#0d4f4a]/15"
                />
                <span className="grid size-[68px] place-items-center rounded-full bg-[#0d4f4a] text-[19px] font-bold tracking-wide text-white shadow-[0_10px_26px_rgba(13,79,74,0.34)]">
                  LD
                </span>
              </div>
            </div>

            <h2 className="mt-5 text-center text-[27px] font-bold tracking-[-0.02em] text-[#14312f]">
              Welcome back
            </h2>
            <p className="mt-1.5 text-center text-[14px] text-[#5a6b69]">
              Sign in to continue to LD Silk Mills ERP
            </p>

            {error === "invalid_credentials" && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-[#c2413a]/30 bg-[#c2413a]/10 px-3.5 py-2.5 text-[12.5px] text-[#a5342e]"
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
              className="mt-6"
            >
              <button
                type="submit"
                className="group flex h-[52px] w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#dfd8cc] bg-white text-[15px] font-semibold text-[#14312f] shadow-[0_1px_2px_rgba(20,49,47,0.05)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-[#fcfbf8] hover:shadow-[0_4px_14px_rgba(20,49,47,0.10)] focus-visible:ring-3 focus-visible:ring-[#0d6b62]/35 focus-visible:outline-none active:scale-[0.995]"
              >
                <GoogleIcon className="size-[19px] transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100" />
                Continue with Google
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-[#14312f]/12" />
              <span className="text-[11.5px] font-semibold tracking-[0.12em] text-[#7b8988]">
                OR
              </span>
              <span className="h-px flex-1 bg-[#14312f]/12" />
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
              className="flex flex-col gap-4"
            >
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-[#2a423f]">
                  Email
                </span>
                <span className="relative block">
                  <IconMail
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-[#0d6b62]/70"
                    stroke={1.7}
                  />
                  {/* 15px, never smaller: this is the screen most likely to be
                      opened on a phone, and under 16px iOS zooms on focus and
                      never zooms back. */}
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@ldsilkmills.com"
                    required
                    aria-label="Email"
                    className="h-[52px] w-full rounded-xl border border-[#dfd8cc] bg-white pr-4 pl-11 text-[16px] text-[#14312f] transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-[#9aa5a3] focus:border-[#0d6b62] focus:ring-4 focus:ring-[#0d6b62]/15 sm:text-[15px]"
                  />
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-[#2a423f]">
                  Password
                </span>
                <span className="relative block">
                  <IconLock
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-[18px] -translate-y-1/2 text-[#0d6b62]/70"
                    stroke={1.7}
                  />
                  <PasswordInput
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    required
                    aria-label="Password"
                    className="h-[52px] rounded-xl border-[#dfd8cc] bg-white pl-11 text-[16px] text-[#14312f] transition-[border-color,box-shadow] duration-200 placeholder:text-[#9aa5a3] focus-visible:border-[#0d6b62] focus-visible:ring-4 focus-visible:ring-[#0d6b62]/15 sm:text-[15px]"
                  />
                </span>
              </label>

              {/* In the design, and honest about what it can actually do. */}
              <details className="-mt-1 self-end">
                <summary className="cursor-pointer list-none text-[13px] font-medium text-[#0d6b62] underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                  Forgot password?
                </summary>
                <p className="mt-2 max-w-[38ch] rounded-lg bg-[#0d6b62]/10 px-3 py-2 text-right text-[12px] leading-relaxed text-[#3d4f4d]">
                  There is no reset email. Ask an ERP administrator — they can
                  set a new one for you from Settings in a few seconds.
                </p>
              </details>

              <button
                type="submit"
                className="group relative mt-1 flex h-[56px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-[#0d4f4a] to-[#116b60] text-[15.5px] font-semibold text-white shadow-[0_10px_26px_rgba(13,79,74,0.28)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_14px_34px_rgba(13,79,74,0.36)] focus-visible:ring-3 focus-visible:ring-[#0d6b62]/40 focus-visible:outline-none active:scale-[0.995]"
              >
                Sign in
                <span
                  aria-hidden
                  className="absolute inset-y-0 right-0 grid w-[58px] place-items-center border-l border-white/15 bg-white/10"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-[19px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
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

            <div className="mt-6 flex items-start gap-2.5 border-t border-[#14312f]/10 pt-5">
              <IconShieldCheck
                className="mt-px size-[19px] shrink-0 text-[#0d6b62]"
                stroke={1.7}
              />
              <p className="text-[12.5px] leading-relaxed text-[#5a6b69]">
                <span className="font-semibold text-[#2a423f]">
                  Enterprise grade security.
                </span>
                <br />
                Access is limited to accounts an administrator has set up, and
                every request is checked against them.
              </p>
            </div>
          </section>
        </div>

        <footer
          className="ld-reveal flex flex-col items-center gap-2 pb-2 lg:items-end"
          style={{ "--ld-reveal-delay": "820ms" } as React.CSSProperties}
        >
          <span className="text-[11.5px] text-[#5a6b69]">
            Best experienced in
          </span>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#3d4f4d]">
              <ChromeIcon className="size-[18px]" />
              Chrome
            </span>
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#3d4f4d]">
              <EdgeIcon className="size-[18px]" />
              Edge
            </span>
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#3d4f4d]">
              <FirefoxIcon className="size-[18px]" />
              Firefox
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
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

function ChromeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="11" fill="#fff" />
      <path
        fill="#EA4335"
        d="M12 1a11 11 0 0 1 9.53 5.5H12a5.5 5.5 0 0 0-4.9 3L3.4 4.1A11 11 0 0 1 12 1Z"
      />
      <path
        fill="#34A853"
        d="M3.4 4.1 7.1 9.5A5.5 5.5 0 0 0 12 17.5l-3.5 5.2A11 11 0 0 1 3.4 4.1Z"
      />
      <path
        fill="#FBBC05"
        d="M21.53 6.5A11 11 0 0 1 8.5 22.7L12 17.5a5.5 5.5 0 0 0 4.77-8.25l4.76-2.75Z"
      />
      <circle cx="12" cy="12" r="4.4" fill="#4285F4" />
    </svg>
  );
}

function EdgeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="11" fill="#0F7EC1" />
      <path
        fill="#3DD5B0"
        d="M6 15.5c2.2 3.4 6.6 4.6 10.2 2.8-1.6 2.6-4.6 4-7.6 3.4A9.4 9.4 0 0 1 6 15.5Z"
      />
      <path
        fill="#fff"
        d="M4.2 9.2C5.6 5.3 9.7 3 13.8 3.9c3 .7 5.1 3 5.4 5.9H9.9c-2.4 0-4.4 1.4-5.7-.6Z"
      />
    </svg>
  );
}

function FirefoxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12.6" r="10.4" fill="#FF7139" />
      <path
        fill="#FFBD4F"
        d="M12 3.4a9.2 9.2 0 0 1 8.6 6c-1.7-2.3-4.3-3.4-7-2.9-2.4.5-4 2-4.6 4.2-.5 1.9 0 3.7 1.2 5-2.4-.6-4-2.5-4.4-4.9A9.2 9.2 0 0 1 12 3.4Z"
      />
      <path
        fill="#FF4F5E"
        d="M17.7 10.6c1.4 2.1 1.2 5-.6 6.9a6.6 6.6 0 0 1-8.3.9c2.6.6 5.2-.4 6.6-2.6 1.1-1.7 1.2-3.6.3-5.2Z"
      />
    </svg>
  );
}
