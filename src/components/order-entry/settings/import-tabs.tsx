"use client";

// Two passes over the same workbook, on one screen.
//
// They are sections of one job, not two features: the orders sheet creates the
// orders and the status sheet ticks their stages, and doing the second before
// the first matches nothing. So one header, one switch, one working area —
// rather than two features stacked.
//
// ── WHY THE SWITCH IS NOT A SECOND PILL STRIP ────────────────────────────
//
// It was, and it read as a mistake. The settings strip above it (Design
// Database / Time tracking / Import / Trash) is the same component at the same
// size in the same box, so the page opened with two identical full-width strips
// one under the other and nothing said which was subordinate to which. This one
// is smaller, sits INSIDE the header card next to the title it changes, and is
// the only thing on the page that looks like that — which is what makes it read
// as a choice within Import rather than beside it.

import * as React from "react";
import { IconClipboardList, IconListDetails } from "@tabler/icons-react";

import { Card } from "@/components/ui/card";
import { TemplateButton } from "./template-button";
import { ImportScreen } from "./import-screen";
import { StatusImportScreen } from "./status-import-screen";
import { cn } from "@/lib/utils";

type Which = "orders" | "status";

const TABS = [
  { value: "orders" as const, label: "Orders", icon: IconListDetails },
  { value: "status" as const, label: "Production status", icon: IconClipboardList },
];

export function ImportTabs({
  masterValues,
}: {
  masterValues: Record<string, string[]>;
}) {
  const [which, setWhich] = React.useState<Which>("orders");

  return (
    <div className="flex flex-col gap-4">
      {/* ── Card GIVES NO HORIZONTAL PADDING ──────────────────────────────
          `Card` sets `py-(--card-spacing)` and nothing else; the left and right
          padding lives on `CardHeader`/`CardContent`, which these screens do not
          use. So raw children sit flush against the card's own edge — reported
          as "the text is touching the grid". `px-(--card-spacing)` is the same
          token the vertical padding uses, so the two match and both follow
          `size`. */}
      <Card size="sm" className="flex flex-col gap-4 px-(--card-spacing)">
        {/* The switch sits with the title it changes. Wrapping puts it under
            the title on a narrow screen rather than squeezing both. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-text-1">
            Import from the old spreadsheet
          </h2>
          <div
            role="tablist"
            aria-label="What to import"
            className="flex items-center gap-1 rounded-field bg-chip p-1"
          >
            {TABS.map((t) => {
              const active = t.value === which;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setWhich(t.value)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] px-3 py-1.5",
                    "text-[12.5px] font-semibold transition-colors",
                    active
                      ? "bg-surface text-text-1 shadow-sm"
                      : "text-text-2 hover:text-text-1",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── ONE COLUMN OF PROSE, ONE OF ACTION ────────────────────────
            The copy used to wrap at about 60% of a full-width card and leave
            the rest of the row empty, which is what made the page look
            unfinished. It keeps its reading width and the template download
            takes the space beside it instead of hanging underneath. */}
        {/* ── ONE COLUMN, AND THE HOLE IS THE REASON ───────────────────
            Prose on the left and the template on the right left a 400px gap
            down the middle of the card: the text stops at its reading measure
            and the button is pinned to the far edge, so the eye crosses empty
            space to get from one to the other. They read in order instead —
            what this is, then the thing you download before doing it. */}
        <div className="flex flex-col gap-4">
          {/* ── FULL WIDTH, BECAUSE THAT IS THIS APP'S MEASURE ──────────
              A reading measure was tried here and it was the wrong call: every
              other settings page runs its description across the whole 1,288px
              card (the page subtitle above, Design Database's own note), so a
              619px column made THIS page the odd one out — cramped lines with
              half a card of white beside them, which is what got reported. Match
              the house, not the typography textbook. */}
          <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-text-2">
            {which === "orders" ? (
              <>
                <p>
                  For the half of this financial year that is still in Google Sheets.
                  Export the tab as <strong>CSV</strong> or upload the{" "}
                  <strong>.xlsx</strong>. One row per design line — the order number,
                  party and date only need to be on the first row of each order, the
                  way they look in the sheet.
                </p>
                <p>
                  An order number{" "}
                  <strong className="text-text-1">already in the system is left alone</strong>
                  , so nothing entered here since May can be overwritten, and running
                  the same file twice is harmless.
                </p>
              </>
            ) : (
              <>
                <p>
                  The second pass over the same workbook. This one creates nothing —
                  it finds each design line that is{" "}
                  <strong className="text-text-1">already in the system</strong> and
                  ticks the stages the sheet says are done.{" "}
                  <strong className="text-text-1">Import the orders first.</strong>
                </p>
                <p>
                  It <strong className="text-text-1">never unticks</strong>. A stage
                  blank in the sheet but ticked here is left exactly as it is, so the
                  file is safe to run twice and safe to run on a working day.
                </p>
              </>
            )}
          </div>

          <div>
            {which === "orders" ? (
              <TemplateButton
                key="orders"
                label="Download the order template"
                file="order-import-template.xlsx"
                build={() =>
                  import("@/lib/order-entry/import/templates").then((m) =>
                    m.buildOrdersTemplate(),
                  )
                }
              />
            ) : (
              <TemplateButton
                key="status"
                label="Download the status template"
                file="production-status-import-template.xlsx"
                build={() =>
                  import("@/lib/order-entry/import/templates").then((m) =>
                    m.buildStatusTemplate(),
                  )
                }
              />
            )}
          </div>
        </div>
      </Card>

      {/* Both are kept MOUNTED. Switching to check the other sheet and coming
          back to find the file gone — mapping, preview and all — is the kind of
          small loss that makes somebody re-upload rather than look. */}
      <div className={which === "orders" ? "" : "hidden"}>
        <ImportScreen masterValues={masterValues} />
      </div>
      <div className={which === "status" ? "" : "hidden"}>
        <StatusImportScreen />
      </div>
    </div>
  );
}
