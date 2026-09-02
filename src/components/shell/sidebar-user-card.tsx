import Link from "next/link";
import { IconSettings } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutMenuItem } from "./sign-out-button";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// The account menu is reachable from here AND from the topbar avatar
// (user-menu.tsx) — same items, same component pattern — since this card
// is the more prominent, always-visible one and shouldn't be a dead end.
export function SidebarUserCard({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string | null;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-surface-3 text-xs font-bold text-accent-text">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={name} className="size-full object-cover" />
            ) : (
              initials(name)
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
            <div className="truncate text-[13px] font-semibold text-text-1">
              {name}
            </div>
            <div className="truncate text-[11.5px] text-text-3">{email}</div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-[13px] font-semibold">{name}</span>
              <span className="text-[11.5px] font-normal text-text-3">
                {email}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link href="/settings">
                <IconSettings className="size-[15px]" />
                Settings
              </Link>
            }
          />
          <DropdownMenuSeparator />
          <SignOutMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
