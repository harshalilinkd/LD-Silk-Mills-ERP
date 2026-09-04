"use client";

import * as React from "react";
import { IconPackageImport } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { markReceivedAction } from "./actions";

/**
 * Mark received — a small form, not a bare button.
 *
 * The standalone app's Receiving list has a one-click "Mark received", and the
 * two Bhiwandi amounts are then only enterable afterwards by opening the return
 * and editing it. In practice that is why they go unfilled: the moment somebody
 * KNOWS the transport cost is the moment the lorry arrives with the bill, and a
 * separate trip back into an edit screen is a step that quietly does not
 * happen. Asking for both here, at the point of receipt, is the one change to
 * the workflow in this port — and it is the change most likely to fix the
 * finding that all 160 comparable returns have an "actual" identical to the
 * expectation.
 *
 * Both fields stay OPTIONAL. Making them required would block a receipt when
 * the bill has not arrived, and an unreceived return is worse than a blank
 * charge — the goods are physically here either way.
 */
export function ReceiveButton({
  returnId,
  displayId,
  party,
  expectedTransport,
  full,
}: {
  returnId: number;
  displayId: string;
  party: string | null;
  /** What Head Office expected to pay, shown for comparison while typing. */
  expectedTransport: string | null;
  /** Full-width, for the phone card layout. */
  full?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [transport, setTransport] = React.useState("");
  const [charges, setCharges] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await markReceivedAction(returnId, {
        bhiwandiTransportValue: transport,
        bhiwandiCharges: charges,
        notes,
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  };

  const expected = expectedTransport == null ? null : Number(expectedTransport);

  return (
    <>
      <Button
        size="sm"
        className={full ? "h-10 w-full" : "h-8"}
        onClick={() => setOpen(true)}
      >
        <IconPackageImport className="size-4" /> Mark received
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              Receive <span className="num">{displayId}</span>
            </DialogTitle>
            <DialogDescription>
              {party ?? "Unknown party"} — confirm the goods have arrived at
              Bhiwandi.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-text-2">
                  Transport paid (Balasaheb)
                </span>
                <Input
                  // A numeric keypad on a phone, which is where this is used.
                  inputMode="decimal"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  placeholder="Optional"
                  className="h-9 num"
                />
                {expected != null && (
                  <span className="text-[11.5px] text-text-3">
                    Head Office expected ₹
                    {expected.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-text-2">
                  Bhiwandi charges
                </span>
                <Input
                  inputMode="decimal"
                  value={charges}
                  onChange={(e) => setCharges(e.target.value)}
                  placeholder="Optional"
                  className="h-9 num"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-text-2">
                Notes
              </span>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth recording — optional"
                className="h-9"
              />
            </label>

            <p className="text-[12px] text-text-3">
              Leave an amount blank if the bill has not come yet. Blank is
              recorded as &ldquo;not known&rdquo;, never as zero.
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Confirm received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
