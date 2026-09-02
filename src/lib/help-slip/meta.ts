import {
  IconAlertTriangle,
  IconArchive,
  IconCircleCheck,
  IconCircleDot,
  IconFlag,
  IconLoader2,
  IconPlayerPause,
  type Icon,
} from "@tabler/icons-react";

import type {
  AccountStatus,
  ConcernPriority,
  ConcernStatus,
  UserRole,
} from "@/db/help-slip/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How a Help Slip enum LOOKS and READS. The single source of truth.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported verbatim (EN + HI + icon) from the standalone app's
 * `src/lib/statusMeta.ts` and `src/lib/roleMeta.ts`. The colours are
 * translated to this repo's tokens (docs/DESIGN.md) rather than copied — the
 * source ships its own `--status-*-fg/bg/bd` triplets and its hexes would be
 * invisible in one of our two themes.
 *
 * EVERY status render in this module goes through these maps. No component
 * may map a status to a colour, an icon or a label inline: the moment two
 * places do it they drift, and the drift shows up as a badge that is amber on
 * the list and orange on the detail page.
 *
 * Two rules the source is emphatic about, and both survive the port:
 *
 *  1. **Every entry carries BOTH an icon and a label.** Status is never
 *     carried by colour alone — a WCAG requirement, and also the difference
 *     between readable and unreadable on a mid-range phone in Bhiwandi
 *     sunlight.
 *  2. **Nothing renders a raw enum.** `admin` is a value in a Postgres type;
 *     "Admin" is a word a person recognises; `pc` is neither — it is an
 *     abbreviation of an internal job title that means nothing to the
 *     employee reading their own profile. Every lookup below falls back to an
 *     EM DASH, never the raw value: if a new enum member is added upstream and
 *     not here, the screen must show nothing and send someone to this file,
 *     not quietly start printing `auditor`.
 *
 * ── colour translation, source → ours ─────────────────────────────────────
 *   new         cyan   #0e7490 / #67e8f9  →  status-blue   (informational)
 *   in_progress amber  #b45309 / #fbbf24  →  status-amber  (exact match)
 *   waiting     violet #6d28d9 / #c4b5fd  →  status-purple
 *   resolved    green  #15803d / #86efac  →  status-green  (exact match)
 *   closed      grey   #52525b / #a1a1aa  →  chip / text-3 (no hue, on purpose)
 *   overdue     red    #b91c1c / #fca5a5  →  status-red
 */

export type StatusMeta = {
  icon: Icon;
  labelEn: string;
  labelHi: string;
  /** What the employee should understand it to mean. */
  meaningEn: string;
  /** Foreground (icon + label) on the soft fill. */
  fgClass: string;
  /** The soft fill itself. */
  bgClass: string;
  /** Only the overdue badge draws a border; the rest are fill-only pills. */
  borderClass: string;
  /**
   * The SOLID fill for a dot or a timeline node.
   *
   * `bgClass` is the pale tint and is invisible at 8px, so a dot needs the
   * FOREGROUND colour as its background. Spelled out rather than derived from
   * `fgClass` by string replacement: a status maps to a colour in exactly one
   * place, and a regex over a class name is not that place.
   */
  dotClass: string;
};

export const STATUS_META: Record<ConcernStatus, StatusMeta> = {
  new: {
    icon: IconCircleDot,
    labelEn: "New",
    labelHi: "नया",
    meaningEn: "Received. Not opened yet.",
    fgClass: "text-status-blue",
    bgClass: "bg-status-blue-dim",
    borderClass: "border-status-blue/35",
    dotClass: "bg-status-blue",
  },
  in_progress: {
    icon: IconLoader2,
    labelEn: "In Progress",
    labelHi: "चालू है",
    meaningEn: "Someone is working on it.",
    fgClass: "text-status-amber",
    bgClass: "bg-status-amber-dim",
    borderClass: "border-status-amber/35",
    dotClass: "bg-status-amber",
  },
  waiting: {
    icon: IconPlayerPause,
    labelEn: "Waiting",
    labelHi: "रुका हुआ",
    meaningEn: "Blocked — the reason is shown below.",
    fgClass: "text-status-purple",
    bgClass: "bg-status-purple-dim",
    borderClass: "border-status-purple/35",
    dotClass: "bg-status-purple",
  },
  resolved: {
    icon: IconCircleCheck,
    labelEn: "Resolved",
    labelHi: "हल हो गया",
    meaningEn: "Fixed. Read what was done.",
    fgClass: "text-status-green",
    bgClass: "bg-status-green-dim",
    borderClass: "border-status-green/35",
    dotClass: "bg-status-green",
  },
  closed: {
    icon: IconArchive,
    labelEn: "Closed",
    labelHi: "बंद",
    meaningEn: "Finished, no further action.",
    // Grey, not a hue — the same call `StatusBadge`'s PENDING makes in
    // src/components/ui/status-badge.tsx. "Closed" is the absence of further
    // work; giving it a colour puts it in competition with the four statuses
    // that mean something is happening.
    fgClass: "text-text-3",
    bgClass: "bg-chip",
    borderClass: "border-border-strong",
    dotClass: "bg-text-3",
  },
};

/**
 * DERIVED, not a status.
 *
 * It appears BESIDE the status badge and never replaces it — a concern can be
 * `waiting` AND overdue at once, and collapsing the two loses exactly the
 * fact the coordinator needs in order to act.
 */
export const OVERDUE_META: StatusMeta = {
  icon: IconAlertTriangle,
  labelEn: "Overdue",
  labelHi: "देरी",
  meaningEn: "Past its due date and still open.",
  fgClass: "text-status-red",
  bgClass: "bg-status-red-dim",
  borderClass: "border-status-red/35",
  // Overdue never renders as a timeline node — it is a derived flag beside a
  // status, not an event that happened. The class is here so the type holds.
  dotClass: "bg-status-red",
};

export type PriorityMeta = {
  icon: Icon | null;
  labelEn: string;
  labelHi: string;
  /**
   * null for `low` and `normal`. ~80% of rows carry no priority chip at all,
   * which is exactly what keeps the ones that do carry weight. Priority is
   * OUTLINE-only so it can never be mistaken for, or compete with, the filled
   * status badge beside it.
   */
  chipClass: string | null;
  /** `urgent` alone gets a leading dot, as the one thing that stops a shift. */
  showDot: boolean;
};

export const PRIORITY_META: Record<ConcernPriority, PriorityMeta> = {
  low: {
    icon: null,
    labelEn: "Low",
    labelHi: "कम",
    chipClass: null,
    showDot: false,
  },
  normal: {
    icon: null,
    labelEn: "Normal",
    labelHi: "सामान्य",
    chipClass: null,
    showDot: false,
  },
  high: {
    icon: IconFlag,
    labelEn: "High",
    labelHi: "ज़्यादा",
    chipClass: "border-status-amber text-status-amber",
    showDot: false,
  },
  urgent: {
    icon: IconFlag,
    labelEn: "Urgent",
    labelHi: "अर्जेंट",
    chipClass: "border-status-red text-status-red",
    showDot: true,
  },
};

/** Ordering for the PC queue: most urgent first. */
export const PRIORITY_RANK: Record<ConcernPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type EnumMeta = { labelEn: string; labelHi: string };

export const ROLE_META: Record<UserRole, EnumMeta> = {
  employee: { labelEn: "Employee", labelHi: "कर्मचारी" },
  // The house calls them the PC. Spelled out here because a profile line is
  // read once, by someone who may never have heard the abbreviation.
  pc: { labelEn: "Process Coordinator", labelHi: "प्रोसेस कोऑर्डिनेटर" },
  admin: { labelEn: "Admin", labelHi: "एडमिन" },
};

export const ACCOUNT_STATUS_META: Record<AccountStatus, EnumMeta> = {
  active: { labelEn: "Active", labelHi: "सक्रिय" },
  inactive: { labelEn: "Inactive", labelHi: "निष्क्रिय" },
  suspended: { labelEn: "Suspended", labelHi: "निलंबित" },
};

/**
 * The extra grant that lets a coordinator read `hr_only` concerns. NOT a role.
 *
 * Shown as "Confidential access", not "HR access". The database column is
 * `hr_access` and the visibility enum member is `hr_only` — those names stay,
 * because renaming a column and an enum member is a migration with a wide
 * blast radius for a wording fix. But nothing user-facing should invent an HR
 * role this system does not have: the roles are Employee, Process Coordinator
 * and Admin, and this is a flag on top of one of them.
 */
export const HR_ACCESS_META: EnumMeta = {
  labelEn: "Confidential access",
  labelHi: "गोपनीय पहुँच",
};

export const EM_DASH = "—";

/** Look up a status without trusting the caller's type. Unmapped → null. */
export function statusMeta(status: string | null | undefined): StatusMeta | null {
  if (!status) return null;
  return STATUS_META[status as ConcernStatus] ?? null;
}

export function priorityMeta(
  priority: string | null | undefined,
): PriorityMeta | null {
  if (!priority) return null;
  return PRIORITY_META[priority as ConcernPriority] ?? null;
}

function read(
  meta: EnumMeta | undefined | null,
  locale: HelpSlipLocale,
): string {
  if (!meta) return EM_DASH;
  return locale === "hi" ? meta.labelHi : meta.labelEn;
}

export type HelpSlipLocale = "en" | "hi";

export function statusLabel(
  status: string | null | undefined,
  locale: HelpSlipLocale = "en",
): string {
  const meta = statusMeta(status);
  if (!meta) return EM_DASH;
  return locale === "hi" ? meta.labelHi : meta.labelEn;
}

export function priorityLabel(
  priority: string | null | undefined,
  locale: HelpSlipLocale = "en",
): string {
  const meta = priorityMeta(priority);
  if (!meta) return EM_DASH;
  return locale === "hi" ? meta.labelHi : meta.labelEn;
}

export function roleLabel(
  role: string | null | undefined,
  locale: HelpSlipLocale = "en",
): string {
  if (!role) return EM_DASH;
  return read(ROLE_META[role as UserRole], locale);
}

export function accountStatusLabel(
  status: string | null | undefined,
  locale: HelpSlipLocale = "en",
): string {
  if (!status) return EM_DASH;
  return read(ACCOUNT_STATUS_META[status as AccountStatus], locale);
}

export function hrAccessLabel(locale: HelpSlipLocale = "en"): string {
  return read(HR_ACCESS_META, locale);
}
