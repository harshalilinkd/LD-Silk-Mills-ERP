import Link from "next/link";

import { fieldBase, selectBase } from "@/components/ui/module-parts";
import { cn } from "@/lib/utils";

/**
 * The slicers, and they are a PLAIN GET FORM on purpose.
 *
 * The obvious build is a client component that pushes to the router on every
 * change. This is better here: a dashboard that re-runs two reports on every
 * keystroke is a dashboard that spends its life loading, the whole screen is
 * otherwise server-rendered with nothing else in the browser bundle, and a GET
 * form gives back-button history, a shareable URL and a working screen with
 * JavaScript switched off for free.
 *
 * `Apply` submits; `Clear` is an ordinary link back to the bare route.
 */
export type Option = { value: string; label: string };

export function DashboardFilters({
  action,
  from,
  to,
  party,
  agent,
  parties,
  agents,
}: {
  action: string;
  from: string;
  to: string;
  party?: string;
  agent?: string;
  parties: Option[];
  agents: Option[];
}) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface-2 px-4 py-3.5"
    >
      <Filter label="From">
        <input type="date" name="from" defaultValue={from} className={cn(fieldBase, "h-9")} />
      </Filter>
      <Filter label="To">
        <input type="date" name="to" defaultValue={to} className={cn(fieldBase, "h-9")} />
      </Filter>
      <Filter label="Party" wide>
        <select name="party" defaultValue={party ?? ""} className={cn(selectBase, "h-9")}>
          <option value="">All parties</option>
          {parties.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Filter>
      <Filter label="Agent" wide>
        <select name="agent" defaultValue={agent ?? ""} className={cn(selectBase, "h-9")}>
          <option value="">All agents</option>
          {agents.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Filter>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-field bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Apply
        </button>
        <Link
          href={action}
          className="inline-flex h-9 items-center rounded-field border border-border px-3.5 text-[13px] font-medium text-text-3 transition-colors hover:text-text-1"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

function Filter({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", wide ? "min-w-[190px] flex-1" : "w-[152px]")}>
      <span className="text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
