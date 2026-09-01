import { SearchCommand } from "./search-command";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

function greeting() {
  const hour = new Date().getHours();
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
    <header className="flex h-[66px] shrink-0 items-center gap-5 border-b border-border bg-background px-7 sticky top-0 z-20">
      <div className="min-w-0 shrink-0">
        <p className="truncate text-[14.5px] font-semibold leading-tight">
          {greeting()}, <span className="text-accent-text">{firstName}</span>
        </p>
        <p className="truncate text-[11.5px] text-text-3">{todayLabel()}</p>
      </div>

      <div className="ml-auto flex max-w-[420px] flex-1 justify-end">
        <SearchCommand />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <NotificationBell />
        <UserMenu name={name} email={email} avatar={avatar} />
      </div>
    </header>
  );
}
