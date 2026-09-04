"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { IconMenu2, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The sidebar, on a phone
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The sidebar was `hidden md:flex` — below 768px it simply vanished, and
 * NOTHING replaced it. There was no hamburger, no drawer, no bottom bar: a
 * phone could reach the dashboard and then had no way to get to Orders, CRM,
 * Help Slip or Settings at all. Everything below is that hole being filled.
 *
 * ── ONE COPY OF THE NAVIGATION, NOT TWO ───────────────────────────────────
 *
 * The obvious build is a desktop `<aside>` plus a separate mobile menu. That
 * is two navigation trees to keep in step, and they do not stay in step — a
 * system added to one is missing from the other six months later.
 *
 * So the SAME server-rendered `<Sidebar>` is passed in as `children` and
 * rendered exactly once. Only its positioning changes: off-canvas and fixed
 * below `md`, an ordinary flex child above it. Passing it as children is also
 * what keeps `<Sidebar>` a server component — children arrive as already
 * rendered elements, so nothing crosses the server/client boundary that
 * cannot be serialised. (See the note in CLAUDE.md about never passing icon
 * COMPONENTS across that line; this sidesteps it entirely.)
 *
 * ── WHY A CONTEXT AND NOT PROPS ───────────────────────────────────────────
 *
 * The trigger lives in the topbar and the panel wraps the sidebar; they are
 * siblings in the layout with no parent to hold the state between them
 * without lifting it. The provider is that lift, and it stays in this file so
 * the whole mechanism is one thing to read.
 */

type MobileNavContext = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const Ctx = React.createContext<MobileNavContext | null>(null);

function useMobileNav(): MobileNavContext {
  const v = React.useContext(Ctx);
  if (!v)
    throw new Error("MobileNav components must be inside MobileNavProvider");
  return v;
}

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // CLOSE ON NAVIGATION. Without this the drawer stays open on top of the page
  // it just navigated to, which reads as a broken link — you tapped Orders,
  // something happened behind the menu, and the menu is still there.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape, and no body scroll behind the drawer. On touch, a scrollable page
  // under a fixed overlay is what makes a drawer feel like it is floating on
  // something broken.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The hamburger. Lives in the topbar, exists only below `md`. */
export function MobileNavTrigger() {
  const { open, setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation menu"
      aria-expanded={open}
      aria-controls="app-sidebar"
      // 40px, which clears the 40px touch floor the rest of the topbar uses.
      className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-text-2 transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none md:hidden"
    >
      <IconMenu2 className="size-[19px]" stroke={1.8} />
    </button>
  );
}

/**
 * The panel itself, plus its scrim.
 *
 * `fixed` and translated off-screen below `md`; a plain `static` flex child at
 * `md` and up, where `translate-x-0` is forced on so the drawer state can
 * never leak into the desktop layout — an unclosed drawer would otherwise
 * leave the sidebar shifted off the left edge when the window is widened.
 */
export function MobileNavPanel({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();

  return (
    <>
      {/* Scrim. Rendered always and faded, rather than mounted on open, so the
          drawer has something to fade back out against when it closes. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] transition-transform duration-300 ease-out",
          "md:static md:z-auto md:w-[264px] md:max-w-none md:translate-x-0 md:transition-none",
          "motion-reduce:transition-none",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        {children}

        {/* Close button, inside the drawer and only on mobile. The scrim and
            Escape both work, but neither is discoverable on a touch screen. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation menu"
          className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1 md:hidden"
        >
          <IconX className="size-[18px]" stroke={1.8} />
        </button>
      </div>
    </>
  );
}
