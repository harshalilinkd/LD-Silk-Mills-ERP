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
import {
  CATEGORY_LABELS,
  SYSTEM_CATEGORIES,
  type SystemCategory,
} from "@/lib/system-categories";
import { updateSystem } from "./actions";

type SystemStatus = System["status"];

/**
 * The labels the sidebar itself prints, so what you choose here is what you
 * will read there. Base UI renders the RAW VALUE in a closed `<Select>` unless
 * `items` is passed — that is why both dropdowns below pass one, and why the
 * status box used to sit reading "coming_soon".
 */
const STATUS_LABELS: Record<SystemStatus, string> = {
  active: "Active",
  coming_soon: "Coming soon",
  maintenance: "Maintenance",
};


export function SystemEditDialog({ system }: { system: System }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SystemStatus>(system.status);
  const [url, setUrl] = useState(system.applicationUrl ?? "");
  const [category, setCategory] = useState<SystemCategory>(system.category);
  const [sortOrder, setSortOrder] = useState(system.sortOrder);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStatus(system.status);
    setUrl(system.applicationUrl ?? "");
    setCategory(system.category);
    setSortOrder(system.sortOrder);
  }

  function onSave() {
    startTransition(async () => {
      await updateSystem(system.id, {
        status,
        category,
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
            <label className="text-[13px] font-medium text-text-2">
              Status
            </label>
            <Select
              value={status}
              items={STATUS_LABELS}
              onValueChange={(v) => setStatus(v as SystemStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as SystemStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-2">
              Sidebar section
            </label>
            <Select
              value={category}
              items={CATEGORY_LABELS}
              onValueChange={(v) => setCategory(v as SystemCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11.5px] leading-snug text-text-3">
              Which heading it sits under. Within a section the order comes
              from Sort order below.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-2">
              Application URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-2">
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
