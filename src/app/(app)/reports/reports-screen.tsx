"use client";

import * as React from "react";
import {
  IconArrowLeft,
  IconChartHistogram,
  IconChecklist,
  IconClipboardList,
  IconDownload,
  IconFileSpreadsheet,
  IconFileText,
  IconLifebuoy,
  IconLock,
  IconTable,
  IconTruckReturn,
  IconUsersGroup,
  IconWallet,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHead,
  PrimaryButton,
  QuietButton,
  SearchBox,
  Select,
  TableCard,
  Toolbar,
} from "@/components/ui/module-parts";
import { ReportsTabs } from "./reports-tabs";

export type FilterCard = {
  key: string;
  label: string;
  kind: "dateRange" | "select" | "text";
  help?: string;
  options?: { value: string; label: string }[];
};

export type ReportCard = {
  id: string;
  title: string;
  description: string;
  columnCount: number;
  allowed: boolean;
  lockedBy: string | null;
  defaultFrom: string | null;
  defaultTo: string | null;
  filters: FilterCard[];
};

export type ModuleGroup = {
  module: string;
  label: string;
  reports: ReportCard[];
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The report picker — modules first, then the reports inside one
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY TWO STEPS AND NOT ONE LONG LIST ──────────────────────────────────
 *
 * The catalogue is heading for thirty-seven reports across seven modules. As a
 * single scrolling list that is a wall: somebody looking for a Petty Cash
 * figure reads past every Order Entry card to find it, and the count of what
 * they can actually reach is never visible at a glance.
 *
 * So the front of this screen is one card per MODULE — how many reports it has,
 * how many of them this person may run, and whether it is locked. Opening one
 * shows only its reports. It is the shape the owner asked for and it is also
 * the shape the sidebar already uses, so the ERP reads the same way twice.
 *
 * Searching cuts across the whole catalogue rather than the open module,
 * because somebody who types "returns" wants the report, not the module.
 */

const MODULE_ICON: Record<string, React.ReactNode> = {
  "order-entry": <IconClipboardList className="size-5" />,
  crm: <IconUsersGroup className="size-5" />,
  "goods-return": <IconTruckReturn className="size-5" />,
  "petty-cash": <IconWallet className="size-5" />,
  "help-slip": <IconLifebuoy className="size-5" />,
  checklist: <IconChecklist className="size-5" />,
  cross: <IconChartHistogram className="size-5" />,
};

const MODULE_BLURB: Record<string, string> = {
  "order-entry": "What was ordered, what it is worth, and how far through the mill it has got.",
  crm: "Follow-up calls, what customers said, and the complaints behind them.",
  "goods-return": "Cloth coming back — why, from whom, and what it costs to handle.",
  "petty-cash": "Money in and out of the cash box, and what it was spent on.",
  "help-slip": "Concerns raised by staff, and how quickly they were answered.",
  checklist: "Recurring duties, and whether they were done on time.",
  cross: "The whole business on one page, and one customer across every module.",
};

export function ReportsScreen({
  groups,
  today,
}: {
  groups: ModuleGroup[];
  today: string;
}) {
  const [search, setSearch] = React.useState("");
  const [openModule, setOpenModule] = React.useState<string | null>(null);
  const [openReport, setOpenReport] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const matches = (r: ReportCard, moduleLabel: string) =>
    !q ||
    r.title.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    moduleLabel.toLowerCase().includes(q);

  const total = groups.reduce((s, g) => s + g.reports.length, 0);
  const usable = groups.reduce((s, g) => s + g.reports.filter((r) => r.allowed).length, 0);

  // While searching, every match is shown wherever it lives. Otherwise the
  // screen is either the module cards or one module's reports.
  const shownGroups = searching
    ? groups
        .map((g) => ({ ...g, reports: g.reports.filter((r) => matches(r, g.label)) }))
        .filter((g) => g.reports.length > 0)
    : openModule
      ? groups.filter((g) => g.module === openModule)
      : [];

  const current = openModule ? groups.find((g) => g.module === openModule) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Reporting"
        title={!searching && current ? current.label : "Reports"}
        lede={
          !searching && current
            ? MODULE_BLURB[current.module] ?? "Every report for this module."
            : "Every module's reports, in one place. Take the rows on their own, or a workbook with the analysis already done."
        }
        action={
          !searching && current ? (
            <QuietButton
              className="h-9"
              onClick={() => {
                setOpenModule(null);
                setOpenReport(null);
              }}
            >
              <IconArrowLeft className="size-3.5" />
              All modules
            </QuietButton>
          ) : undefined
        }
      />

      <ReportsTabs />

      <Toolbar
        search={
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search every report…"
          />
        }
      >
        <span className="text-[12.5px] whitespace-nowrap text-text-3">
          {usable} of {total} available to you
        </span>
      </Toolbar>

      {/* ── the module cards ─────────────────────────────────────────── */}
      {!searching && !openModule && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const open = g.reports.filter((r) => r.allowed).length;
            const soon = g.reports.length === 0;
            const locked = !soon && open === 0;
            const dim = soon || locked;
            return (
              <button
                key={g.module}
                type="button"
                disabled={soon}
                onClick={() => !soon && setOpenModule(g.module)}
                className={cn(
                  "flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 text-left transition-colors",
                  soon
                    ? "cursor-default"
                    : "cursor-pointer hover:border-primary/40 hover:bg-surface-2",
                  dim && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-field",
                      dim ? "bg-chip text-text-3" : "bg-accent text-accent-text",
                    )}
                  >
                    {MODULE_ICON[g.module] ?? <IconTable className="size-5" />}
                  </span>
                  <span
                    className={cn(
                      "num rounded-pill px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
                      dim ? "bg-chip text-text-3" : "bg-accent text-accent-text",
                    )}
                  >
                    {soon
                      ? "Coming soon"
                      : locked
                        ? "Locked"
                        : `${open} report${open === 1 ? "" : "s"}`}
                  </span>
                </div>

                <div>
                  <h2 className="text-[15px] font-bold text-text-1">{g.label}</h2>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-text-3">
                    {MODULE_BLURB[g.module] ?? `${g.reports.length} reports.`}
                  </p>
                </div>

                <p className="mt-auto pt-1 text-[11.5px] text-text-3">
                  {soon ? (
                    "Being built — the data is there, the reports are not yet."
                  ) : locked ? (
                    <>
                      <IconLock className="mr-1 inline size-3" />
                      Needs access to {g.reports[0]?.lockedBy ?? g.label}
                    </>
                  ) : open < g.reports.length ? (
                    `${open} of ${g.reports.length} you can run`
                  ) : (
                    "Open to see them all"
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* ── the reports inside a module, or the search results ────────── */}
      {(searching || openModule) &&
        (shownGroups.length === 0 ? (
          <TableCard
            empty={
              <EmptyState
                icon={<IconTable className="size-5" />}
                title="Nothing matches that"
                body="Try part of a report or module name, or clear the search."
              />
            }
          />
        ) : (
          shownGroups.map((g) => (
            <section key={g.module} className="flex flex-col gap-2.5">
              {searching && (
                <h2 className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                  {g.label}
                </h2>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                {g.reports.map((r) => (
                  <Report
                    key={r.id}
                    report={r}
                    today={today}
                    open={openReport === r.id}
                    onToggle={() => setOpenReport(openReport === r.id ? null : r.id)}
                  />
                ))}
              </div>
            </section>
          ))
        ))}
    </div>
  );
}

function Report({
  report,
  today,
  open,
  onToggle,
}: {
  report: ReportCard;
  today: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [from, setFrom] = React.useState(report.defaultFrom ?? "");
  const [to, setTo] = React.useState(report.defaultTo ?? today);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"csv" | "xlsx" | null>(null);

  const download = (format: "csv" | "xlsx") => {
    setError(null);
    if (from && to && from > to) {
      setError("The start date is after the end date.");
      return;
    }
    const p = new URLSearchParams({ format });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    for (const [k, v] of Object.entries(values)) if (v) p.set(k, v);

    setBusy(format);
    // A navigation, not a fetch: a 50,000-row workbook held in browser memory
    // to be handed straight back to the browser is pure cost, and the download
    // survives the tab being navigated away from.
    window.location.href = `/api/reports/${report.id}?${p}`;
    // A navigation download fires no completion event, so the button un-busies
    // on a timer rather than pretending to know.
    window.setTimeout(() => setBusy(null), 2500);
  };

  if (!report.allowed) {
    return (
      <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-2 px-4 py-3.5 opacity-75">
        <div className="flex items-center gap-2">
          <IconLock className="size-3.5 shrink-0 text-text-3" />
          <h3 className="text-[14px] font-bold text-text-2">{report.title}</h3>
        </div>
        <p className="text-[12.5px] leading-snug text-text-3">{report.description}</p>
        <p className="mt-0.5 text-[11.5px] text-text-3">
          Needs access to{" "}
          <strong className="font-semibold text-text-2">{report.lockedBy}</strong> — an
          administrator can tick it in Settings → Access.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-card border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex cursor-pointer flex-col gap-1 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[14.5px] font-bold text-text-1">{report.title}</h3>
          <span className="num shrink-0 text-[11.5px] text-text-3">
            {report.columnCount} columns
          </span>
        </div>
        <p className="text-[12.5px] leading-snug text-text-3">{report.description}</p>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" htmlFor={`${report.id}-from`}>
              <Input
                id={`${report.id}-from`}
                type="date"
                className="num"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor={`${report.id}-to`}>
              <Input
                id={`${report.id}-to`}
                type="date"
                className="num"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>

            {report.filters
              .filter((f) => f.kind !== "dateRange")
              .map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  htmlFor={`${report.id}-${f.key}`}
                  hint="Optional"
                >
                  {f.kind === "select" ? (
                    <Select
                      id={`${report.id}-${f.key}`}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                    >
                      <option value="">Everyone</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={`${report.id}-${f.key}`}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                    />
                  )}
                </Field>
              ))}
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <QuietButton
              className="h-9"
              busy={busy === "csv"}
              onClick={() => download("csv")}
            >
              <IconFileText className="size-3.5" />
              Download CSV
            </QuietButton>
            <PrimaryButton busy={busy === "xlsx"} onClick={() => download("xlsx")}>
              <IconFileSpreadsheet className="size-3.5" />
              Download Excel
            </PrimaryButton>
            <span className="ml-auto hidden text-[11.5px] text-text-3 sm:block">
              <IconDownload className="mr-1 inline size-3" />
              Excel adds a dashboard sheet; CSV is the rows on their own.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
