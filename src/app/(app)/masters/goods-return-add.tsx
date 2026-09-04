"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MasterType } from "@/lib/goods-return/master-data";
import { addGoodsReturnName } from "./goods-return-actions";

/**
 * Add one name to a Goods Return list.
 *
 * Reports the difference between "added" and "already there" rather than
 * treating both as success. The insert is `ON CONFLICT DO NOTHING` against a
 * UNIQUE name, so typing an existing party silently succeeds — and a screen
 * that says "Added" about a row it did not create teaches somebody to add the
 * same name twice, differently spelled, next time they are unsure.
 */
export function GoodsReturnAdd({
  type,
  label,
}: {
  type: MasterType;
  label: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();

  const submit = () => {
    const value = name.trim();
    if (!value) return;
    setMsg(null);
    start(async () => {
      const res = await addGoodsReturnName(type, value);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setName("");
      setMsg({
        ok: true,
        text: res.created
          ? `Added “${res.name}”.`
          : `“${res.name}” was already on the list.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Add a ${label.replace(/s$/, "").toLowerCase()}…`}
          className="h-9 min-w-0 flex-1 sm:max-w-[320px]"
        />
        <Button
          size="sm"
          className="h-9"
          disabled={pending || !name.trim()}
          onClick={submit}
        >
          <IconPlus className="size-4" /> {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {msg && (
        <p
          role="status"
          className={
            msg.ok
              ? "text-[12px] text-status-green"
              : "text-[12px] text-status-red"
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
