"use client";

import { useTransition, useState } from "react";
import {
  IconArrowRight,
  IconBuildingWarehouse,
  IconBuildingSkyscraper,
  IconLoader2,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import type { GoodsReturnOffice } from "@/lib/goods-return/offices";
import { chooseOffice } from "./actions";

/**
 * "Head Office or Bhiwandi Office?" — asked on the way in, every time the
 * choice has not been made on this device.
 *
 * The standalone app asked this on its LOGIN page, as the login. Here sign-in
 * has already happened and the person is known by name; this only asks which
 * side of the operation they are working from right now. That is why the two
 * cards describe a JOB rather than an account, and why "You can switch at any
 * time" is on the screen — the old one was a door, this one is a desk you sit
 * at, and somebody may sit at both in a day.
 *
 * Deliberately NOT auto-selecting a remembered office and skipping straight
 * through: the cookie already does that. Reaching this screen means there is no
 * remembered answer, and guessing one for a person about to record money is
 * worse than one extra click.
 */
const OFFICES: {
  office: GoodsReturnOffice;
  title: string;
  blurb: string;
  does: string[];
  icon: typeof IconBuildingSkyscraper;
}[] = [
  {
    office: "head_office",
    title: "Head Office",
    blurb: "Record returns going out, and keep the lists behind them.",
    does: ["New returns", "Edit returns", "Reports", "Master lists"],
    icon: IconBuildingSkyscraper,
  },
  {
    office: "bhiwandi",
    title: "Bhiwandi Office",
    blurb: "Confirm goods that have arrived, and what they cost to get here.",
    does: ["Receive goods", "Enter transport & charges", "Reports"],
    icon: IconBuildingWarehouse,
  },
];

export function ChooseOffice({ name }: { name: string }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<GoodsReturnOffice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = (office: GoodsReturnOffice) => {
    setPicked(office);
    setError(null);
    start(async () => {
      try {
        await chooseOffice(office);
      } catch (e) {
        setPicked(null);
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 py-6 sm:py-12">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Which office today, {name.split(" ")[0]}?
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Goods Return works differently at each end. Pick where you are
          working from — you can switch at any time.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {OFFICES.map(({ office, title, blurb, does, icon: Icon }) => {
          const busy = pending && picked === office;
          return (
            <button
              key={office}
              type="button"
              onClick={() => pick(office)}
              disabled={pending}
              className={cn(
                "group flex min-h-[var(--tap,44px)] flex-col gap-3 rounded-card border border-border bg-surface p-4 text-left transition-all",
                "hover:border-primary/40 hover:bg-surface-2",
                "focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                busy && "border-primary/50",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset">
                  {busy ? (
                    <IconLoader2 className="size-5 animate-spin" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </span>
                <span className="flex-1 text-[15px] font-bold text-text-1">
                  {title}
                </span>
                <IconArrowRight className="size-4 shrink-0 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-text-1" />
              </div>

              <p className="text-[13px] leading-relaxed text-text-2">{blurb}</p>

              <ul className="flex flex-wrap gap-1.5">
                {does.map((d) => (
                  <li
                    key={d}
                    className="rounded-pill bg-chip px-2 py-0.5 text-[11px] font-medium text-text-2"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
        >
          {error}
        </p>
      )}

      <p className="text-[12px] text-text-3">
        Both offices see every return and every report. The difference is who
        records a new one and who confirms it arrived.
      </p>
    </div>
  );
}
