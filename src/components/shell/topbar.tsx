import { SearchCommand } from "./search-command";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
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
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/75 md:px-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {greeting()}, {firstName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {todayLabel()}
        </p>
      </div>

      <div className="hidden flex-1 justify-center sm:flex">
        <SearchCommand />
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell />
        <ThemeToggle />
        <UserMenu name={name} email={email} avatar={avatar} />
      </div>
    </header>
  );
}
