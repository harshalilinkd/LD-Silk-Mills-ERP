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
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-3 transition-colors hover:bg-surface-2"
      >
        <IconSearch className="size-[15px] shrink-0" />
        <span className="flex-1 truncate text-left">Search anything...</span>
        <kbd className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] text-text-3">
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
