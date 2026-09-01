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
import type { User } from "@/db/schema";
import { updateUser } from "./actions";

export function UserEditDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState<"active" | "inactive">(user.status);
  const [isPending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      await updateUser(user.id, { name, status });
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(user.name);
          setStatus(user.status);
        }
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${user.name}`}
      >
        <IconPencil className="size-3.5" />
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Email
            </label>
            <Input value={user.email} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "inactive")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
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
