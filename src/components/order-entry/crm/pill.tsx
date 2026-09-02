// Restyled from Order Entry's components/crm/crm-pill.tsx against this app's
// own design tokens (docs/DESIGN.md) rather than the source app's — same
// component shapes (Pill / StatusPill / PriorityBar), different palette:
// bg-status-{color}-dim + text-status-{color} instead of the source's
// bg-{tone}/10 + text-{tone} idiom, rounded-full instead of rounded-pill (this
// app has no custom pill/card/field radius tokens, just rounded-[10px]/-full/-lg).
import {
  STATUS_LABEL,
  type FollowupStatus,
  type IssueSeverity,
  type PriorityBand,
} from "@/lib/order-entry/crm";
import { cn } from "@/lib/utils";

const TONE = {
  due: "bg-chip text-text-3",
  progress: "bg-status-blue-dim text-status-blue",
  done: "bg-status-green-dim text-status-green",
  late: "bg-status-red-dim text-status-red",
  warn: "bg-status-amber-dim text-status-amber",
} as const;

type Tone = keyof typeof TONE;

export function Pill({
  tone,
  dot = true,
  children,
  className,
}: {
  tone: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<FollowupStatus, Tone> = {
  DUE: "due",
  IN_PROGRESS: "progress",
  COMPLETED: "done",
  UNREACHABLE: "warn",
  NOT_REQUIRED: "due",
};

export function StatusPill({
  status,
  overdue,
}: {
  status: FollowupStatus;
  overdue?: boolean;
}) {
  // "Call overdue", not "Overdue": every row in this queue is a DELIVERED
  // order, so a bare "Overdue" reads as if the ORDER is late — a different
  // clock (the Order status board). What's overdue here is the phone call,
  // measured from delivery + crm_settings.followup_due_days.
  if (overdue && (status === "DUE" || status === "IN_PROGRESS")) {
    return <Pill tone="late">Call overdue</Pill>;
  }
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

const SEVERITY_TONE: Record<IssueSeverity, Tone> = {
  HIGH: "late",
  MEDIUM: "warn",
  LOW: "due",
};

export function SeverityPill({ severity }: { severity: IssueSeverity }) {
  return (
    <Pill tone={SEVERITY_TONE[severity]}>
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
    </Pill>
  );
}

// The priority bar. Colour alone would fail CLAUDE.md/DESIGN.md's rule that
// close hues must carry a label too, so this always ships with a title/
// aria-label, and the band is also printed as text next to it on every row
// that uses it.
const BAND: Record<PriorityBand, string> = {
  high: "bg-status-red",
  medium: "bg-status-amber",
  low: "bg-chip-strong",
};

export function PriorityBar({ band, label }: { band: PriorityBand; label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn("block h-[26px] w-1 shrink-0 rounded-sm", BAND[band])}
    />
  );
}
