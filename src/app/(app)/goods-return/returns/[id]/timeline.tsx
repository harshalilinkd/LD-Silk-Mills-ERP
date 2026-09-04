import {
  IconCirclePlus,
  IconClock,
  IconPackage,
  IconTruckDelivery,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * Entry created → Posted to Bhiwandi → Received.
 *
 * Three fixed steps, because the workflow has exactly three and never branches.
 * A step is "done" when the date behind it EXISTS — not when the status says
 * so, which matters for the middle one: 129 of the 341 live returns were never
 * given a posted-on date, so a timeline keyed off status alone would draw a
 * completed step under a blank.
 *
 * Vertical below sm. The horizontal rail needs three labels and two connectors
 * across the viewport, and at 360px that is four words on top of each other.
 */
export function ReturnTimeline({
  createdAt,
  postedOn,
  receivedAt,
}: {
  createdAt: Date | string;
  postedOn: string | null;
  receivedAt: Date | string | null;
}) {
  const dt = (d: Date | string | null) =>
    d
      ? new Date(d).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  const d = (v: string | null) =>
    v
      ? new Date(v).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : null;

  const steps = [
    {
      key: "created",
      label: "Entry created",
      when: dt(createdAt),
      icon: IconCirclePlus,
      done: true,
    },
    {
      key: "posted",
      label: "Posted to Bhiwandi",
      when: d(postedOn),
      icon: IconTruckDelivery,
      done: postedOn != null,
      pendingNote: "No date recorded",
    },
    {
      key: "received",
      label: receivedAt ? "Received at Bhiwandi" : "Awaiting receipt",
      when: dt(receivedAt),
      icon: receivedAt ? IconPackage : IconClock,
      done: receivedAt != null,
    },
  ];

  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <li
            key={s.key}
            className="flex gap-3 sm:flex-1 sm:flex-col sm:gap-2"
          >
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset",
                  s.done
                    ? "bg-accent text-accent-text ring-accent-text/20"
                    : "bg-surface-2 text-text-3 ring-border",
                )}
              >
                <Icon className="size-4" />
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "w-px flex-1 sm:h-px sm:w-full",
                    steps[i + 1].done ? "bg-primary/40" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </div>
            <div className="pb-1 sm:pb-0">
              <div
                className={cn(
                  "text-[13px] font-semibold",
                  s.done ? "text-text-1" : "text-text-3",
                )}
              >
                {s.label}
              </div>
              <div className="num text-[12px] text-text-3">
                {s.when ?? s.pendingNote ?? "—"}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
