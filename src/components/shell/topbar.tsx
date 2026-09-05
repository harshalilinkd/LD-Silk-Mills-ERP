import { MobileNavTrigger } from "./mobile-nav";
import { SearchCommand } from "./search-command";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The clock here is BHIWANDI'S, not the server's
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a Server Component, so `new Date()` is the clock of whatever machine
 * Vercel ran it on — which is UTC. India is five and a half hours ahead, so
 * the bar was wrong for most of the working day and every night:
 *
 *   · 5pm in Bhiwandi is 11:30 UTC, so it still said "Good morning".
 *   · Between midnight and 5:30am the DATE was yesterday's — the one thing on
 *     this bar somebody might actually rely on.
 *
 * `timeZone: "Asia/Kolkata"` fixes both, and it is the same correction the
 * Checklist's `todayIso()` already carries for the same reason. IST has no
 * daylight saving, so there is nothing seasonal to get wrong.
 */
const IST = "Asia/Kolkata";

function greeting() {
  const hour = Number(
    new Date().toLocaleString("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: IST,
    }),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: IST,
  });
}

export function Topbar({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string | null;
}) {
  const firstName = name.split(" ")[0];

  return (
    <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-4 sm:px-5 md:h-[66px] md:gap-5 md:px-7">
      <MobileNavTrigger />
      {/* On a phone this is the least useful thing in the bar and it was
          squeezing the search box and the actions off the edge. The date goes
          first, the greeting shortens to the name, and both come back with
          the room to hold them. */}
      <div className="min-w-0 shrink-0">
        <p className="truncate text-[13.5px] leading-tight font-semibold md:text-[14.5px]">
          <span className="hidden sm:inline">{greeting()}, </span>
          <span className="text-accent-text">{firstName}</span>
        </p>
        <p className="hidden truncate text-[11.5px] text-text-3 sm:block">
          {todayLabel()}
        </p>
      </div>

      <div className="ml-auto flex min-w-0 max-w-[420px] flex-1 justify-end">
        <SearchCommand />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <NotificationBell />
        <UserMenu name={name} email={email} avatar={avatar} />
      </div>
    </header>
  );
}
