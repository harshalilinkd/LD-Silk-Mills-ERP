"use client";

import { IconLogout } from "@tabler/icons-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(app)/actions";

export function SignOutMenuItem() {
  return (
    <DropdownMenuItem
      variant="destructive"
      onSelect={(e) => {
        e.preventDefault();
        signOutAction();
      }}
    >
      <IconLogout className="size-4" />
      Log out
    </DropdownMenuItem>
  );
}
