"use client";

import * as React from "react";
import {
  IconDownload,
  IconFileSpreadsheet,
  IconFileText,
  IconLock,
  IconTable,
} from "@tabler/icons-react";

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

/**
 * The report picker.
 *
 * ── THE FORMAT IS A CHOICE, NOT A SETTING ────────────────────────────────
 *
 * Two buttons, both visible, each saying what it is for — because they are
 * genuinely different jobs. CSV is the rows for another system to eat; Excel
 * is the same rows plus a dashboard for a person to read. Hiding one behind a
 * dropdown would make the choice feel like a preference to be got right rather
 * than a fork with an obvious answer either way.
 *
 * ── DOWNLOADING IS A NAVIGATION, NOT A FETCH ─────────────────────────────
 *
 * The export opens the API route directly rather than fetching the bytes into
 * JavaScript and building a blob. A 50,000-row workbook held in browser memory
 * to be handed straight back to the browser is pure cost, and the download
 * survives the tab being navigated away from.
 */
export function ReportsScreen({
  groups,
  today,
}: {
  groups: { module: string; label: string; reports: ReportCard[] }[];
  today: string;
}) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      reports: g.reports.filter(
        (r) =>
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.reports.length > 0);

  const total = groups.reduce((s, g) => s + g.reports.length, 0);
  const usable = groups.reduce((s, g) => s + g.reports.filter((r) => r.allowed).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Reporting"
        title="Reports"
        lede="Every module's reports, in one place. Take the rows on their own, or a workbook with the analysis already done."
      />

      <Toolbar
        search={
          <SearchBox value={search} onChange={setSearch} placeholder="Search reports…" />
        }
      >
        <span className="text-[12.5px] whitespace-nowrap text-text-3">
          {usable} of {total} available to you
        </span>
      </Toolbar>

      {shown.length === 0 ? (
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
        shown.map((g) => (
          <section key={g.module} className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
              {g.label}
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.reports.map((r) => (
                <Report
                  key={r.id}
                  report={r}
                  today={today}
                  open={open === r.id}
                  onToggle={() => setOpen(open === r.id ? null : r.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
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
    // A navigation, not a fetch — see the header. The browser handles the
    // download and the page stays where it is.
    window.location.href = `/api/reports/${report.id}?${p}`;
    // There is no completion event for a navigation download, so the button
    // un-busies on a timer rather than pretending to know.
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
                <Field key={f.key} label={f.label} htmlFor={`${report.id}-${f.key}`} hint="Optional">
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
