import Image from "next/image";
import { redirect } from "next/navigation";
import { IconLock, IconMail, IconShieldCheck } from "@tabler/icons-react";

import { auth } from "@/auth";
import { PasswordInput } from "@/components/ui/password-input";
import { signInWithGoogle, signInWithPassword } from "./actions";
import loginBackdrop from "../../../public/login-bg.jpg";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sign in — one idea: light moving across cloth
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rebuilt after the first pass was rejected as blurred, badly fitted, and a
 * card that "doesn't match the background". Each was a real fault with a real
 * cause, and each is fixed below rather than restyled around.
 *
 * ── 1. THE BLUR WAS AN UPSCALE, NOT A LOOK ────────────────────────────────
 *
 * Measured, not guessed: the source photograph is 1536px wide and the browser
 * was stretching it across a 1904px viewport — 1.25x, so every source pixel
 * was smeared over 1.56 screen pixels by plain bilinear interpolation (on a
 * 2560 monitor, 2.8). That is the whole explanation for "looking blurred".
 *
 * `public/login-bg.jpg` is now a 2560px master resampled with lanczos3 and an
 * unsharp mask, which measured 3.7x the on-screen edge energy of the old file
 * (394 -> 1454, variance-of-Laplacian after a simulated browser stretch). It
 * is a bigger MASTER, not a bigger payload: next/image still serves a
 * per-viewport AVIF/WebP derivative.
 *
 * The grain layer is the other half of that fix and is doing as much work as
 * the sharpening. Interpolated pixels read as mush; a few percent of fine
 * noise gives the eye real high-frequency detail to hold onto, and a real
 * photograph has grain in it anyway.
 *
 * ── 2. IT MUST NOT SCROLL ─────────────────────────────────────────────────
 *
 * `lg:h-dvh lg:overflow-hidden`, and — the part that actually makes that safe
 * — every vertical measurement in the card is `clamp(min, Nvh, max)` rather
 * than a fixed pixel value. The card BREATHES on a tall screen and COMPACTS on
 * a short one instead of overflowing it. Fixed heights plus `overflow-hidden`
 * would not fit the screen, it would amputate the form.
 *
 * Below `lg` the page scrolls normally, deliberately: on a phone the keyboard
 * eats half the viewport, and locking the height there is how you hide your
 * own submit button behind it.
 *
 * ── 3. MAKING THE CARD BELONG TO THE PHOTOGRAPH ───────────────────────────
 *
 * It read as pasted on because it was: a near-opaque pale-GREY rectangle owes
 * nothing to what sits behind it. It is now a swatch card of warm stock lying
 * on the cloth — a cream that shares the photograph's own highlight tone,
 * `backdrop-blur` + `backdrop-saturate` so the sage and teal bleed up through
 * it, a hairline highlight along the top edge where card stock catches window
 * light, and a shadow tinted teal rather than grey, because a shadow falling
 * on coloured cloth takes the colour of that cloth.
 *
 * THE TINT DOES THE BELONGING, NOT THE TRANSPARENCY. First attempt ran the
 * card at 70% opacity and the teal weave came straight through the labels and
 * the security line — it matched the photograph by becoming unreadable. It
 * sits at 88% now: still glass, still coloured by what is behind it, but the
 * form is on solid ground. Measured after the change rather than eyeballed,
 * because "looks fine to me" is how the last unreadable thing shipped. Do not
 * lower this number to make it prettier.
 *
 * ── 4. THE MOTION, AND WHY IT IS ALL ONE IDEA ─────────────────────────────
 *
 * Light moving across silk. That is the entire vocabulary; nothing here is an
 * effect for its own sake.
 *   · the cloth breathes — 70s Ken Burns, alternating   (`ld-drape`)
 *   · a sheen crosses it every 15s, then rests          (`ld-sheen`)
 *   · the accent rule is a thread being laid down       (`ld-thread`)
 *   · the card settles onto the cloth                   (`ld-settle`)
 *   · the emblem ring turns once every 40s              (`ld-orbit`)
 *   · the submit button catches the same sheen on hover
 *
 * Both CONTINUOUS effects live on the photograph, behind the scrim, at single
 * digits of opacity — because the failure mode of "eye-catching" on a sign-in
 * screen is a page that fidgets while somebody is typing their password. All
 * of it is defined in globals.css and all of it stops under
 * `prefers-reduced-motion`.
 *
 * ── ONE HONEST DEPARTURE ──────────────────────────────────────────────────
 *
 * "Forgot password?" is in the design and is rendered, but this ERP has no
 * reset flow — no outbound email exists anywhere in it, and a reset link that
 * goes nowhere is worse than no link. It expands a sentence saying what
 * actually works. `<details>`, so it works before hydration.
 */

/** Fine photographic grain, inline so it costs no request. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { callbackUrl, error } = await searchParams;

  return (
    <div className="relative min-h-dvh w-full bg-[#e9dfcd] lg:h-dvh lg:overflow-hidden">
      {/* ═══ the cloth ════════════════════════════════════════════════ */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        {/* The wrapper is what moves, not the Image — so next/image keeps its
            own layout maths intact and the transform stays on the compositor. */}
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

        {/* The sheen — wide, soft, on the diagonal. Light crossing silk. */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="ld-sheen absolute -inset-y-1/3 left-0 w-[38%] rotate-[16deg] will-change-transform"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.10) 60%, rgba(255,255,255,0) 100%)",
            }}
          />
        </div>

        <div
          className="absolute inset-0 opacity-[0.055] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        {/* Scrim, lighter than before and pulled left. The old one washed out
            88% of the cloth at the very edge the photograph is best in. It
            only has to carry the headline, so it only covers the headline. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(102deg, rgba(250,246,238,0.80) 0%, rgba(250,246,238,0.52) 26%, rgba(250,246,238,0.14) 48%, rgba(250,246,238,0) 62%)",
          }}
        />

        {/* A warm vignette, so the corners never compete with the card. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 45%, rgba(46,42,32,0) 42%, rgba(46,42,32,0.20) 100%)",
          }}
        />
      </div>

      {/* ═══ content ══════════════════════════════════════════════════ */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1800px] flex-col px-[clamp(20px,3vw,64px)] py-[clamp(16px,3vh,34px)] lg:h-full">
        {/* ═══ wordmark ═══════════════════════════════════════════════ */}
        <header
          className="ld-reveal flex shrink-0 items-center gap-3.5"
          style={{ "--ld-reveal-delay": "0ms" } as React.CSSProperties}
        >
          <span className="grid size-[clamp(40px,5.4vh,52px)] place-items-center rounded-[13px] bg-[#0d4f4a] text-[clamp(14px,1.9vh,17px)] font-bold tracking-wide text-white shadow-[0_8px_22px_rgba(13,79,74,0.34)]">
            LD
          </span>
          <span className="text-[clamp(17px,2.4vh,22px)] font-bold tracking-[-0.02em] text-[#12302e]">
            LD Silk Mills ERP
          </span>
        </header>

        <div className="grid flex-1 items-center gap-8 py-[clamp(12px,2.4vh,28px)] lg:grid-cols-[1.1fr_minmax(0,510px)] lg:gap-14">
          {/* ═══ the promise ══════════════════════════════════════════ */}
          <section className="max-w-[580px]">
            <h1
              className="ld-reveal font-[family-name:var(--font-display)] text-[clamp(30px,min(4.7vw,6.4vh),58px)] leading-[1.06] font-normal tracking-[-0.015em] text-[#132f2d]"
              style={{ "--ld-reveal-delay": "90ms" } as React.CSSProperties}
            >
              Weave every thread.
              <br />
              <span className="text-[#0b665e]">Power</span> every process.
            </h1>

            {/* The thread, laid down from the margin outward. */}
            <div
              className="ld-thread mt-[clamp(14px,2.6vh,30px)] h-[3px] w-16 rounded-full bg-gradient-to-r from-[#0b665e] to-[#0b665e]/25"
              style={{ "--ld-reveal-delay": "420ms" } as React.CSSProperties}
            />
          </section>

          {/* ═══ the swatch card ══════════════════════════════════════ */}
          <section
            className="ld-settle relative w-full justify-self-center overflow-hidden rounded-[22px] border border-white/65 bg-[#faf6ee]/88 p-[clamp(20px,3.2vh,34px)] shadow-[0_34px_90px_-24px_rgba(14,52,48,0.55),0_2px_10px_rgba(14,52,48,0.10)] backdrop-blur-[20px] backdrop-saturate-150 lg:justify-self-end"
            style={{ "--ld-reveal-delay": "260ms" } as React.CSSProperties}
          >
            {/* The lit top edge of the stock. */}
            <span
              aria-hidden
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent"
            />

            <div className="flex justify-center">
              <div className="relative grid size-[clamp(60px,8.6vh,88px)] place-items-center">
                <span
                  aria-hidden
                  className="ld-orbit absolute inset-0 rounded-full border border-dashed border-[#0d4f4a]/40"
                />
                <span
                  aria-hidden
                  className="absolute inset-[9px] rounded-full border border-[#0d4f4a]/22"
                />
                <span className="grid size-[clamp(42px,5.9vh,60px)] place-items-center rounded-full bg-gradient-to-br from-[#12594f] to-[#0a423e] text-[clamp(14px,1.9vh,19px)] font-bold tracking-wide text-white shadow-[0_10px_26px_rgba(13,79,74,0.40)]">
                  LD
                </span>
              </div>
            </div>

            <h2 className="mt-[clamp(10px,1.8vh,18px)] text-center text-[clamp(20px,2.9vh,27px)] font-bold tracking-[-0.02em] text-[#132f2d]">
              Welcome back
            </h2>
            <p className="mt-1 text-center text-[clamp(12px,1.6vh,14px)] text-[#526561]">
              Sign in to continue to LD Silk Mills ERP
            </p>

            {error === "invalid_credentials" && (
              <p
                role="alert"
                className="mt-[clamp(10px,1.8vh,18px)] rounded-xl border border-[#b8403a]/30 bg-[#b8403a]/10 px-3.5 py-2 text-[12.5px] text-[#993029]"
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
              className="mt-[clamp(12px,2.2vh,22px)]"
            >
              <button
                type="submit"
                className="group flex h-[clamp(42px,5.6vh,50px)] w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#ded4c2] bg-white/90 text-[clamp(13px,1.8vh,15px)] font-semibold text-[#132f2d] shadow-[0_1px_3px_rgba(20,49,47,0.07)] transition-[background-color,box-shadow,border-color] duration-200 hover:border-[#cfc3ac] hover:bg-white hover:shadow-[0_6px_18px_rgba(20,49,47,0.12)] focus-visible:ring-3 focus-visible:ring-[#0b665e]/35 focus-visible:outline-none active:scale-[0.995]"
              >
                <GoogleIcon className="size-[18px] transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100" />
                Continue with Google
              </button>
            </form>

            <div className="my-[clamp(10px,1.9vh,20px)] flex items-center gap-4">
              <span className="h-px flex-1 bg-[#132f2d]/14" />
              <span className="text-[11px] font-semibold tracking-[0.14em] text-[#4d5e5a]">
                OR
              </span>
              <span className="h-px flex-1 bg-[#132f2d]/14" />
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
              className="flex flex-col gap-[clamp(9px,1.7vh,15px)]"
            >
              <label className="flex flex-col gap-[clamp(4px,0.9vh,8px)]">
                <span className="text-[clamp(11.5px,1.5vh,13px)] font-semibold text-[#2b423f]">
                  Email
                </span>
                <span className="relative block">
                  <IconMail
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 text-[#0b665e]/70"
                    stroke={1.7}
                  />
                  {/* 16px on phones, never smaller: under 16px iOS zooms the
                      whole page on focus and never zooms back out. */}
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@ldsilkmills.com"
                    required
                    aria-label="Email"
                    className="h-[clamp(42px,5.6vh,50px)] w-full rounded-xl border border-[#ded4c2] bg-white/95 pr-4 pl-11 text-[16px] text-[#132f2d] transition-[border-color,box-shadow,background-color] duration-200 outline-none placeholder:text-[#9aa5a2] focus:border-[#0b665e] focus:bg-white focus:ring-4 focus:ring-[#0b665e]/14 sm:text-[clamp(13px,1.8vh,15px)]"
                  />
                </span>
              </label>

              <label className="flex flex-col gap-[clamp(4px,0.9vh,8px)]">
                <span className="text-[clamp(11.5px,1.5vh,13px)] font-semibold text-[#2b423f]">
                  Password
                </span>
                <span className="relative block">
                  <IconLock
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-[17px] -translate-y-1/2 text-[#0b665e]/70"
                    stroke={1.7}
                  />
                  {/* No `minLength`. This field proves you know an EXISTING
                      password; the length rule belongs where one is CHOSEN, in
                      Settings. Gating it here would lock out anyone holding a
                      password set under an older rule. */}
                  <PasswordInput
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    required
                    aria-label="Password"
                    className="h-[clamp(42px,5.6vh,50px)] rounded-xl border-[#ded4c2] bg-white/95 pl-11 text-[16px] text-[#132f2d] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[#9aa5a2] focus-visible:border-[#0b665e] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#0b665e]/14 sm:text-[clamp(13px,1.8vh,15px)]"
                  />
                </span>
              </label>

              <details className="-mt-0.5 self-end">
                <summary className="cursor-pointer list-none text-[clamp(11.5px,1.5vh,13px)] font-medium text-[#0b665e] underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                  Forgot password?
                </summary>
                <p className="mt-1.5 max-w-[38ch] rounded-lg bg-[#0b665e]/10 px-3 py-2 text-right text-[12px] leading-relaxed text-[#3c4e4b]">
                  There is no reset email. Ask an ERP administrator — they can
                  set a new one for you from Settings in a few seconds.
                </p>
              </details>

              <button
                type="submit"
                className="group relative mt-0.5 flex h-[clamp(44px,6vh,54px)] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-[#0a423e] via-[#0d554e] to-[#12695f] text-[clamp(13.5px,1.9vh,15.5px)] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(11,66,62,0.65)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_16px_36px_-8px_rgba(11,66,62,0.75)] focus-visible:ring-3 focus-visible:ring-[#0b665e]/45 focus-visible:outline-none active:scale-[0.995]"
              >
                {/* The same sheen as the cloth, on the same material logic. */}
                <span
                  aria-hidden
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                />
                <span className="relative">Sign in</span>
                <span
                  aria-hidden
                  className="absolute inset-y-0 right-0 grid w-[54px] place-items-center border-l border-white/15 bg-white/10"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
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

            <div className="mt-[clamp(12px,2.1vh,20px)] flex items-start gap-2.5 border-t border-[#132f2d]/12 pt-[clamp(10px,1.7vh,16px)]">
              <IconShieldCheck
                className="mt-px size-[17px] shrink-0 text-[#0b665e]"
                stroke={1.7}
              />
              <p className="text-[clamp(11px,1.5vh,12.5px)] leading-relaxed text-[#526561]">
                <span className="font-semibold text-[#2b423f]">
                  Enterprise grade security.
                </span>{" "}
                Access is limited to accounts an administrator has set up.
              </p>
            </div>
          </section>
        </div>
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
