"use client";

import { useTransition } from "react";
import {
  IconBuildingSkyscraper,
  IconBuildingWarehouse,
  IconSwitchHorizontal,
} from "@tabler/icons-react";

import { OFFICE_LABEL } from "@/lib/goods-return/offices";
import { useGoodsReturn } from "./office-context";
import { switchOffice } from "./actions";

/**
 * The "you are working as …" strip that sits under every heading in the module.
 *
 * It exists because the office changes what the screens DO, and a mode you
 * cannot see is a mode you forget you are in. A Head Office person who does not
 * notice they are set to Bhiwandi just finds the New Return button missing and
 * assumes the system is broken — which is precisely the class of confusion this
 * whole port is meant to remove.
 *
 * Switching is one click and needs no confirmation: it grants nothing (see
 * `src/lib/goods-return/authz.ts`), it is instantly reversible, and putting a
 * dialog in front of a harmless toggle teaches people to click through
 * dialogs.
 */
export function OfficeBar() {
  const { office } = useGoodsReturn();
  const [pending, start] = useTransition();
  const Icon =
    office === "bhiwandi" ? IconBuildingWarehouse : IconBuildingSkyscraper;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-text ring-1 ring-accent-text/15 ring-inset">
        <Icon className="size-3.5" />
        {OFFICE_LABEL[office]}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => void switchOffice())}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-2 py-1 text-[11.5px] font-medium text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1 disabled:opacity-50"
      >
        <IconSwitchHorizontal className="size-3.5" />
        {pending ? "Switching…" : "Switch office"}
      </button>
    </div>
  );
}
