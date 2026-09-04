"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { setSystemAccess } from "./actions";

/**
 * One tick in the access grid.
 *
 * ── IT USED TO BE ABLE TO LIE, AND THIS IS A PERMISSIONS SCREEN ──────────
 *
 * The first version flipped its own state optimistically and then called the
 * action with no `catch` and no revert:
 *
 *     setChecked(next);
 *     startTransition(async () => { await setSystemAccess(...) });
 *
 * If that call failed for any reason — a dropped connection, a session that
 * expired in another tab, the pool briefly saturated — the box stayed ticked
 * and nothing was saved. On this screen that is the worst possible failure: an
 * administrator sees a tick, believes somebody has been given a system, and
 * that person does not have it. It was noticed exactly that way, on a
 * screenshot showing Goods Return ticked for somebody the database said had no
 * access.
 *
 * Now: a failure puts the box back where it was and says so. And because the
 * server re-renders this grid after every save, the tick also re-syncs to the
 * SERVER's answer whenever that changes — so if two admins are on this screen
 * at once, the second one's view corrects itself rather than drifting.
 */
export function AccessCheckbox({
  userId,
  systemId,
  systemName,
  userName,
  initialValue,
}: {
  userId: string;
  systemId: string;
  systemName?: string;
  userName?: string;
  initialValue: boolean;
}) {
  const [checked, setChecked] = useState(initialValue);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Re-sync when the SERVER's value changes. `useState(initialValue)` only
  // reads its argument on mount, so without this the box keeps whatever it
  // last showed even after the page has been told otherwise.
  const lastServer = useRef(initialValue);
  useEffect(() => {
    if (lastServer.current !== initialValue) {
      lastServer.current = initialValue;
      setChecked(initialValue);
      setFailed(false);
    }
  }, [initialValue]);

  const toggle = () => {
    const previous = checked;
    const next = !checked;
    setChecked(next);
    setFailed(false);
    startTransition(async () => {
      try {
        await setSystemAccess(userId, systemId, next);
      } catch {
        // Put it back. A tick that did not save is worse than no tick.
        setChecked(previous);
        setFailed(true);
      }
    });
  };

  const label =
    userName && systemName
      ? `${systemName} for ${userName}`
      : (systemName ?? "system access");

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={isPending}
      onClick={toggle}
      title={failed ? "That change did not save — try again." : undefined}
      className={cn(
        "inline-flex size-[17px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors disabled:opacity-50",
        checked
          ? "border-primary bg-primary"
          : "border-border-strong bg-transparent",
        // Unmistakable, because the whole point is that a failed save must not
        // look like a successful one.
        failed && "border-status-red bg-status-red-dim",
      )}
    >
      {checked && (
        <IconCheck className="size-[11px] stroke-[3px] text-[#04211d]" />
      )}
      {failed && !checked && (
        <span aria-hidden className="text-[10px] leading-none font-bold text-status-red">
          !
        </span>
      )}
    </button>
  );
}
