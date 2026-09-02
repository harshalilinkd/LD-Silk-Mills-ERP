// Table / THead / TBody / Tr / Th / Td — docs/SCREENS.md §0.4
//
// The only table markup for the Order Entry + CRM module. Do not hand-roll a
// <table> beside these.
//
// WHY THIS FILE AND NOT `ui/table.tsx`: the shadcn table primitive
// (Table/TableHeader/TableHead/TableCell) already occupies that module. It is
// currently unused by any screen, but its export surface is left untouched so
// nothing breaks if the shell picks it up. This module is the module-scoped
// set the spec names, with the spec's own short names.
//
// ┌─ THE SLACK RULE ────────────────────────────────────────────────────────┐
// │ **Exactly one column per table takes `className="w-full"`.**            │
// │                                                                         │
// │ Without it the browser's auto table layout hands every column an equal  │
// │ share of any leftover width, so a thirteen-column order table renders   │
// │ as thirteen wide, half-empty cells with the data floating in the middle │
// │ of each. Marking one column `w-full` makes that column absorb all the   │
// │ slack and every other column shrink to its content.                     │
// │                                                                         │
// │ Pick the column that genuinely varies: Party on Orders, Quality on the  │
// │ tracker, the note/subject column on the CRM lists. Never pick a `.num`  │
// │ column — a stretched numeric column puts its right-aligned figures      │
// │ miles from their header.                                                │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Colour translation from the spec: `ink` → text-1, `line` → border. The
// vertical rules are the border token at reduced alpha — /70 in the header
// (it has to survive against the sticky surface fill) and /45 in the body
// (any stronger and a wide table reads as graph paper).

import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full text-left text-sm text-text-1", className)}
      {...props}
    />
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      // Sticky by default: every screen that uses this set bounds the body
      // height inside <HScroll>, and a header that scrolls away out of a
      // bounded body is the single most-reported complaint about these tables.
      // `bg-surface` outright (not inherit) — see §4B.4: stacking two
      // background utilities leaves the winner to CSS source order and a
      // see-through sticky header is exactly that bug.
      className={cn("sticky top-0 z-20 bg-surface", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn(className)} {...props} />;
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group border-b border-border last:border-0 hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        // Spec: uppercase 13px bold tracking-[0.04em] ink, right rule,
        // last:border-r-0.
        "border-r border-b border-border/70 px-3 py-2 text-[13px] font-bold tracking-[0.04em] whitespace-nowrap text-text-1 uppercase last:border-r-0",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      // Spec: px-3 py-2.5, right rule, last:border-r-0. `...props` is spread
      // so callers can set `title` for a tooltip on truncated text (§3.5).
      className={cn(
        "border-r border-border/45 px-3 py-2.5 align-middle last:border-r-0",
        className,
      )}
      {...props}
    />
  );
}
