"use client";

import { useState, useTransition } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { System } from "@/db/schema";
import { updateSystem } from "./actions";

type SystemStatus = System["status"];

export function SystemEditDialog({ system }: { system: System }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SystemStatus>(system.status);
  const [url, setUrl] = useState(system.applicationUrl ?? "");
  const [sortOrder, setSortOrder] = useState(system.sortOrder);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStatus(system.status);
    setUrl(system.applicationUrl ?? "");
    setSortOrder(system.sortOrder);
  }

  function onSave() {
    startTransition(async () => {
      await updateSystem(system.id, {
        status,
        applicationUrl: url,
        sortOrder,
      });
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${system.systemName}`}
      >
        <IconPencil className="size-3.5" />
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{system.systemName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as SystemStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="coming_soon">Coming soon</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Application URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Sort order
            </label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
