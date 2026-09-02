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

export function UserMenu({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-3 text-xs font-bold text-accent-text outline-none overflow-hidden focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="size-full object-cover" />
        ) : (
          initials(name)
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
  );
}
