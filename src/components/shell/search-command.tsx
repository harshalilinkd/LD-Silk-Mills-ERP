"use client";

import { useEffect, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SearchCommand() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-sm items-center gap-2 rounded-md border border-input bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        <IconSearch className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-0 p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="sr-only">Search</DialogTitle>
            <Input
              autoFocus
              placeholder="Search systems, users, orders..."
              className="border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </DialogHeader>
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="text-sm font-medium">Search coming soon</p>
            <p className="text-xs text-muted-foreground">
              Global search across systems and records isn&apos;t wired up
              yet.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
