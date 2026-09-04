import Link from "next/link";

/**
 * The frame for /privacy and /terms.
 *
 * These two pages exist because Google will not let an OAuth app leave
 * "Testing" without a public privacy policy URL, and the URL has to be
 * reachable WITHOUT signing in — the whole point is that somebody deciding
 * whether to sign in can read it first. Both routes are therefore added to
 * `PUBLIC_PATHS` in middleware.ts.
 *
 * Plain, self-contained styling rather than the app shell: the shell loads a
 * session, a sidebar and a module registry, none of which exist for a signed
 * out reader, and a legal page that depends on a database is a legal page that
 * can 500.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-4">
        <Link
          href="/login"
          className="flex w-fit items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <span className="grid size-10 place-items-center rounded-[11px] bg-[#0a423e] text-[15px] font-bold tracking-wide text-white">
            LD
          </span>
          <span className="text-[17px] font-bold tracking-[-0.02em] text-text-1">
            LD Silk Mills ERP
          </span>
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-text-1">
            {title}
          </h1>
          <p className="text-[13px] text-text-3">Last updated {updated}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 text-[14.5px] leading-relaxed text-text-2">
        {children}
      </div>

      <footer className="mt-auto border-t border-border pt-6 text-[13px] text-text-3">
        <p>
          LD Silk Mills · Questions about this page:{" "}
          <a
            className="text-accent-text underline underline-offset-2"
            href="mailto:mastersystem@linkdprints.com"
          >
            mastersystem@linkdprints.com
          </a>
        </p>
        <p className="mt-2">
          <Link className="underline underline-offset-2" href="/privacy">
            Privacy
          </Link>
          {" · "}
          <Link className="underline underline-offset-2" href="/terms">
            Terms
          </Link>
          {" · "}
          <Link className="underline underline-offset-2" href="/login">
            Sign in
          </Link>
        </p>
      </footer>
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[16px] font-bold text-text-1">{heading}</h2>
      {children}
    </section>
  );
}
