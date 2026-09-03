import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LoomBackdrop } from "./loom-backdrop";
import { signInWithGoogle, signInWithPassword } from "./actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sign in.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A SPLIT, not a card floating on grey. The left half is the company — the
 * loom, the name, what is inside — and the right half is the one job the
 * visitor came to do. Below `lg` the brand half is dropped entirely rather
 * than stacked: on a phone somebody wants the form, not a masthead they have
 * to scroll past.
 *
 * The backdrop is a real plain weave with a shuttle running through it
 * (`loom-backdrop.tsx`). It is the one thing on this screen that could only
 * belong to this company.
 *
 * ── EVERY COLOUR IS A TOKEN ───────────────────────────────────────────────
 * Including on the brand panel, which is why it works in both themes without
 * a second design. The panel is `--surface` with the weave over it, not a
 * hardcoded dark slab that would glow white in light mode.
 *
 * ── MOTION ────────────────────────────────────────────────────────────────
 * The card's parts arrive staggered on `ld-reveal` (globals.css), which
 * already honours `prefers-reduced-motion`; the weave freezes on one frame
 * under the same query. Nothing here moves after the first half second except
 * the shuttle, and the shuttle takes nine seconds to cross.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { callbackUrl, error } = await searchParams;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* ═══ the company ═══════════════════════════════════════════════ */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <LoomBackdrop className="pointer-events-none absolute inset-0 size-full" />

        {/* A wash rising from the bottom, so the copy never fights the weave for
            the same pixels. It reaches full surface by 26% and clears by 82%,
            which puts the headline and paragraph — 40% to 62% down — on a
            ground about half opaque. At the original 4%/55% the shuttle pass
            drew a bright line straight through the paragraph and read as
            strikethrough. Both stops are tokens; a literal here is the classic
            thing that survives into light mode and ruins it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, #04100f 30%, rgba(4,16,15,0.55) 62%, transparent 88%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div
            className="grid size-9 place-items-center rounded-[10px] text-[13px] font-bold text-[#04211d]"
            style={{
              background: "linear-gradient(155deg, var(--primary), #0d9488)",
            }}
          >
            LD
          </div>
          <div className="leading-tight">
            <div className="text-[13.5px] font-bold text-white">
              LD Silk Mills
            </div>
            <div className="text-[11.5px] text-white/55">ERP</div>
          </div>
        </div>

        <div className="ld-reveal relative flex flex-col gap-4">
          <h2 className="max-w-[15ch] text-[42px] leading-[1.05] font-extrabold tracking-[-0.035em] text-white">
            One place for the whole mill.
          </h2>
          <p className="max-w-[46ch] text-[15px] leading-relaxed text-white/70">
            Orders, customers, operations and the help slip — the systems the
            floor already runs on, in a single sign-in.
          </p>

          {/* The modules, as plain facts. Not feature cards: somebody signing
              in already works here and does not need selling to. */}
          <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-2">
            {["Order Entry", "CRM", "Operations", "Help Slip", "Reports"].map(
              (m, i) => (
                <li
                  key={m}
                  className="ld-reveal rounded-pill border border-white/15 bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-white/80 backdrop-blur-sm"
                  style={
                    {
                      "--ld-reveal-delay": `${160 + i * 55}ms`,
                    } as React.CSSProperties
                  }
                >
                  {m}
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="relative text-[11.5px] text-white/45">
          Access is granted by an administrator. Nothing here is public.
        </p>
      </aside>

      {/* ═══ the form ══════════════════════════════════════════════════ */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[380px]">
          {/* On a phone the brand panel is gone, so the mark comes here
              instead — otherwise the first thing anybody sees is a bare
              email box with no idea what it belongs to. */}
          <div
            className="ld-reveal mb-8 flex items-center gap-3 lg:hidden"
            style={{ "--ld-reveal-delay": "0ms" } as React.CSSProperties}
          >
            <div
              className="grid size-10 place-items-center rounded-[10px] text-sm font-bold text-[#04211d]"
              style={{
                background: "linear-gradient(155deg, var(--primary), #0d9488)",
              }}
            >
              LD
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold text-text-1">
                LD Silk Mills
              </div>
              <div className="text-[12px] text-text-3">ERP</div>
            </div>
          </div>

          <div
            className="ld-reveal flex flex-col gap-1.5"
            style={{ "--ld-reveal-delay": "60ms" } as React.CSSProperties}
          >
            <h1 className="text-[26px] leading-tight font-bold tracking-[-0.022em] text-text-1">
              Sign in
            </h1>
            <p className="text-[13.5px] text-text-3">
              Use your work Google account, or the email and password an
              administrator gave you.
            </p>
          </div>

          {error === "invalid_credentials" && (
            <p
              role="alert"
              className="ld-reveal mt-5 rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2.5 text-[12.5px] text-status-red"
            >
              That email and password didn&apos;t work. If you have never set
              one, sign in with Google instead.
            </p>
          )}

          <form
            action={async () => {
              "use server";
              await signInWithGoogle(callbackUrl);
            }}
            className="ld-reveal mt-6"
            style={{ "--ld-reveal-delay": "120ms" } as React.CSSProperties}
          >
            <Button
              type="submit"
              size="lg"
              variant="outline"
              // A quiet OUTLINE, not the teal fill it was. Google's mark is
              // the recognisable thing on this button; a saturated background
              // fights it, and filling both buttons would make neither the
              // obvious one.
              className="group h-11 w-full gap-2.5 border-border-strong text-[14px] font-semibold transition-colors hover:bg-surface-2"
            >
              <GoogleIcon className="size-[18px] transition-transform duration-300 group-hover:scale-110" />
              Continue with Google
            </Button>
          </form>

          <div
            className="ld-reveal my-6 flex items-center gap-3"
            style={{ "--ld-reveal-delay": "170ms" } as React.CSSProperties}
          >
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10.5px] font-semibold tracking-[0.08em] text-text-3 uppercase">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Shown to everybody, always. Whether a given person HAS a password
              is not something this form may reveal — an input that appeared
              only for accounts with one would answer "does this person work
              here?" to anybody who typed an address. */}
          <form
            action={async (formData: FormData) => {
              "use server";
              await signInWithPassword(
                String(formData.get("email") ?? ""),
                String(formData.get("password") ?? ""),
                callbackUrl,
              );
            }}
            className="ld-reveal flex flex-col gap-3"
            style={{ "--ld-reveal-delay": "220ms" } as React.CSSProperties}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-text-2">
                Email
              </span>
              <Input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@ldsilkmills.com"
                required
                // 44px and 16px below sm: this is signed into from a phone on
                // the floor, and anything under 16px makes iOS zoom on focus.
                className="h-11 text-base sm:h-10 sm:text-[13.5px]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-text-2">
                Password
              </span>
              <PasswordInput
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                required
                className="h-11 text-base sm:h-10 sm:text-[13.5px]"
              />
            </label>

            <Button
              type="submit"
              size="lg"
              className="mt-1 h-11 w-full text-[14px] font-semibold transition-transform active:scale-[0.99]"
            >
              Sign in
            </Button>
          </form>

          <p
            className="ld-reveal mt-8 text-[11.5px] text-text-3"
            style={{ "--ld-reveal-delay": "280ms" } as React.CSSProperties}
          >
            Access is restricted to accounts an administrator has already set
            up. If you cannot get in, ask them rather than trying another
            address.
          </p>
        </div>
      </main>
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
