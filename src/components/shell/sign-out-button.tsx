"use client";

import { IconLogout } from "@tabler/icons-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(app)/actions";

export function SignOutMenuItem() {
  return (
    <DropdownMenuItem
      variant="destructive"
      // Base UI's Menu.Item fires `onClick`, not Radix's `onSelect` — this
      // was silently a no-op (the menu just closed, signOutAction() never
      // ran) until caught by an actual end-to-end logout test.
      onClick={() => {
        signOutAction();
      }}
    >
      <IconLogout className="size-4" />
      Log out
    </DropdownMenuItem>
  );
}
