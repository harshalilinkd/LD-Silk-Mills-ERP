// Ported near-verbatim from Order Entry's lib/crm.ts. This file is to CRM
// what workflow.ts is to the stages: the one place that decides what
// "delivered" means, what a rating rolls up to, what gets escalated, and
// what order the queue is worked in.
//
// Must import NOTHING — pulled into client components (the queue and the
// follow-up detail page). Anything the DB layer needs is passed IN by the
// server caller.

export const FOLLOWUP_STATUSES = [
  "DUE",
  "IN_PROGRESS",
  "COMPLETED",
  "UNREACHABLE",
  "NOT_REQUIRED",
] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const DELIVERY_BASES = ["received_lr", "dispatch_transit"] as const;
export type DeliveryBasis = (typeof DELIVERY_BASES)[number];

export const DELAY_REASONS = [
  "transport",
  "our_dispatch",
  "customer_side",
  "unknown",
] as const;
export type DelayReason = (typeof DELAY_REASONS)[number];

export const RATING_SOURCES = ["customer", "coordinator"] as const;
export type RatingSource = (typeof RATING_SOURCES)[number];

export const REORDER_INTENTS = [
  "none",
  "maybe",
  "yes",
  "sample_requested",
] as const;
export type ReorderIntent = (typeof REORDER_INTENTS)[number];

export const ATTEMPT_CHANNELS = ["call", "whatsapp", "visit", "email"] as const;
export type AttemptChannel = (typeof ATTEMPT_CHANNELS)[number];

export const ATTEMPT_OUTCOMES = [
  "connected",
  "no_answer",
  "busy",
  "wrong_number",
  "call_back_later",
  "met_at_our_office",
  "met_at_customer_place",
  "not_available",
] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export const CHANNEL_OUTCOMES: Record<AttemptChannel, AttemptOutcome[]> = {
  call: ["connected", "no_answer", "busy", "wrong_number", "call_back_later"],
  whatsapp: ["connected", "no_answer", "wrong_number", "call_back_later"],
  visit: ["met_at_our_office", "met_at_customer_place", "not_available"],
  email: ["connected", "no_answer", "call_back_later"],
};

export function isReachedOutcome(outcome: string): boolean {
  return (
    outcome === "connected" ||
    outcome === "met_at_our_office" ||
    outcome === "met_at_customer_place"
  );
}

export const DEFAULT_ISSUE_CATEGORIES = [
  "Late delivery",
  "Damage in transit",
  "Shortage in meters",
  "Shade variation",
  "Print defect",
  "Wrong design",
  "Packing",
  "Billing / rate",
  "Other",
] as const;
export type IssueCategory = string;

export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const OWNER_DEPTS = [
  "OPS",
  "DISPATCH",
  "DESIGN",
  "ACCOUNTS",
  "TRANSPORT",
  "SALES",
] as const;
export type OwnerDept = (typeof OWNER_DEPTS)[number];

export const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_RESOLUTIONS = [
  "CREDIT_NOTE",
  "REPLACEMENT",
  "REPRINT",
  "DISCOUNT",
  "EXPLAINED",
  "NO_ACTION",
] as const;
export type IssueResolution = (typeof ISSUE_RESOLUTIONS)[number];

const LEGACY_CATEGORY_LABEL: Record<string, string> = {
  LATE_DELIVERY: "Late delivery",
  DAMAGE_TRANSIT: "Damage in transit",
  SHORTAGE_MTR: "Shortage in meters",
  SHADE_VARIATION: "Shade variation",
  PRINT_DEFECT: "Print defect",
  WRONG_DESIGN: "Wrong design",
  PACKING: "Packing",
  BILLING_RATE: "Billing / rate",
  OTHER: "Other",
};

export function categoryLabel(c: string): string {
  if (LEGACY_CATEGORY_LABEL[c]) return LEGACY_CATEGORY_LABEL[c];
  if (!/^[A-Z][A-Z0-9_]*$/.test(c)) return c;
  const s = c.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const STATUS_LABEL: Record<FollowupStatus, string> = {
  DUE: "Due",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  UNREACHABLE: "Unreachable",
  NOT_REQUIRED: "Not required",
};

export const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  wrong_number: "Wrong number",
  call_back_later: "Call back later",
  met_at_our_office: "Met — at our office",
  met_at_customer_place: "Met — at their place",
  not_available: "Not available",
};

export const CHANNEL_LABEL: Record<AttemptChannel, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  visit: "Visit",
  email: "Email",
};

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  transport: "Transport",
  our_dispatch: "Our dispatch",
  customer_side: "Customer side",
  unknown: "Unknown",
};

export const CRM_DEFAULTS = {
  transitDaysDefault: 3,
  followupDueDays: 2,
  maxAttempts: 3,
  escalateRatingAt: 2,
  autoCreateFollowups: true,
} as const;

export type CrmConfig = {
  transitDaysDefault: number;
  followupDueDays: number;
  maxAttempts: number;
  escalateRatingAt: number;
  autoCreateFollowups: boolean;
  transportTransitDays: Record<string, number> | null;
};

export function transitDaysFor(cfg: CrmConfig, transport: string | null): number {
  if (transport && cfg.transportTransitDays) {
    const v = cfg.transportTransitDays[transport];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  }
  return cfg.transitDaysDefault;
}

export type LineDelivery = {
  receivedLrDone: boolean;
  dispatchDone: boolean;
  dispatchAt: Date | null;
};

export type DeliveryVerdict =
  | { delivered: false }
  | { delivered: true; basis: DeliveryBasis; at: Date };

export function isLineDelivered(
  line: LineDelivery,
  transitDays: number,
  now: Date = new Date(),
): DeliveryVerdict {
  if (line.receivedLrDone) {
    return { delivered: true, basis: "received_lr", at: line.dispatchAt ?? now };
  }
  if (line.dispatchDone && line.dispatchAt) {
    const landed = new Date(line.dispatchAt.getTime() + transitDays * 86_400_000);
    if (landed <= now) {
      return { delivered: true, basis: "dispatch_transit", at: landed };
    }
  }
  return { delivered: false };
}

export function isDelivered(
  lines: LineDelivery[],
  transitDays: number,
  now: Date = new Date(),
): DeliveryVerdict {
  if (lines.length === 0) return { delivered: false };
  let at: Date | null = null;
  let basis: DeliveryBasis = "received_lr";
  for (const line of lines) {
    const v = isLineDelivered(line, transitDays, now);
    if (!v.delivered) return { delivered: false };
    if (v.basis === "dispatch_transit") basis = "dispatch_transit";
    if (!at || v.at > at) at = v.at;
  }
  return { delivered: true, basis, at: at ?? now };
}

export function followupDueAt(deliveredAt: Date, dueDays: number): Date {
  return new Date(deliveredAt.getTime() + dueDays * 86_400_000);
}

export type SubRatings = Record<string, number | null | undefined>;

export type RatingCriterion = {
  key: string;
  label: string;
  hint: string | null;
  sortOrder: number;
  isActive: boolean;
};

export const DEFAULT_RATING_CRITERIA: { key: string; label: string; hint: string }[] = [
  { key: "delivery", label: "Delivery", hint: "timeliness, handling" },
  { key: "quality", label: "Quality", hint: "fabric, print, shade" },
  { key: "packing", label: "Packing", hint: "condition on arrival" },
  { key: "coordination", label: "Coordination", hint: "our communication" },
];

function givenScores(r: SubRatings): number[] {
  return Object.values(r).filter(
    (v): v is number => typeof v === "number" && v >= 1 && v <= 5,
  );
}

export function deriveOverallRating(r: SubRatings): number | null {
  const given = givenScores(r);
  if (given.length === 0) return null;
  const mean = given.reduce((a, b) => a + b, 0) / given.length;
  return Math.min(5, Math.max(1, Math.round(mean)));
}

export function overallRatingExact(r: SubRatings): number | null {
  const given = givenScores(r);
  if (given.length === 0) return null;
  return given.reduce((a, b) => a + b, 0) / given.length;
}

export function shouldEscalate(
  ratingOverall: number | null,
  hasHighSeverityIssue: boolean,
  escalateAt: number = CRM_DEFAULTS.escalateRatingAt,
): boolean {
  if (hasHighSeverityIssue) return true;
  return typeof ratingOverall === "number" && ratingOverall <= escalateAt;
}

export function statusAfterAttempt(
  current: FollowupStatus,
  attemptCount: number,
  outcome: AttemptOutcome,
  maxAttempts: number = CRM_DEFAULTS.maxAttempts,
): FollowupStatus {
  if (current === "COMPLETED" || current === "NOT_REQUIRED") return current;
  if (isReachedOutcome(outcome)) return "IN_PROGRESS";
  if (attemptCount >= maxAttempts) return "UNREACHABLE";
  return "IN_PROGRESS";
}

export function canComplete(ratingOverall: number | null): boolean {
  return typeof ratingOverall === "number" && ratingOverall >= 1 && ratingOverall <= 5;
}

export type PriorityInput = {
  orderValue: number;
  systemOnTime: boolean | null;
  hadOutOfStock: boolean;
  hadCancellation: boolean;
  priorHighSeverity: boolean;
  daysOverdue: number;
};

export type PriorityBand = "high" | "medium" | "low";

export function followupPriority(p: PriorityInput): number {
  let score = 0;
  if (p.orderValue > 0) score += Math.log10(p.orderValue + 1) * 10;
  if (p.systemOnTime === false) score += 18;
  if (p.hadOutOfStock) score += 10;
  if (p.hadCancellation) score += 6;
  if (p.priorHighSeverity) score += 22;
  if (p.daysOverdue > 0) score += Math.min(p.daysOverdue, 14) * 3;
  return score;
}

export function priorityBand(score: number): PriorityBand {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export const PRIORITY_LABEL: Record<PriorityBand, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

export type FollowupSort = "priority" | "oldest" | "value";

export type FollowupRow = {
  id: string;
  orderId: string;
  orderNo: string;
  orderDate: string;
  partyName: string;
  salesPerson: string | null;
  agent: string | null;
  transport: string | null;
  crrCustomerId: number | null;
  status: FollowupStatus;
  deliveryBasis: string | null;
  deliveredAt: string | null;
  dueAt: string | null;
  contactedAt: string | null;
  attemptCount: number;
  isEscalated: boolean;
  systemOnTime: boolean | null;
  ratingOverall: number | null;
  assignedTo: string | null;
  assignedName: string | null;
  orderValue: number;
  qtyMtr: number;
  designs: number;
  qualities: number;
  openIssues: number;
  hadOutOfStock: boolean;
  hadCancellation: boolean;
  daysWaiting: number;
  daysOverdue: number;
  priority: number;
  band: PriorityBand;
};

export type IssueRow = {
  id: string;
  followupId: string;
  orderId: string | null;
  orderNo: string;
  partyName: string;
  quality: string | null;
  designNo: string | null;
  category: IssueCategory;
  severity: IssueSeverity;
  ownerDept: OwnerDept | null;
  qtyAffected: number | null;
  description: string | null;
  status: IssueStatus;
  resolution: IssueResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  ageDays: number;
  orderValue: number;
};

export type IssueList = {
  rows: IssueRow[];
  total: number;
  page: number;
  totalPages: number;
  kpis: {
    open: number;
    valueAtRisk: number;
    medianResolutionDays: number | null;
    highSeverity: number;
  };
  byDept: { key: string; count: number }[];
  byCategory: { key: IssueCategory; count: number }[];
};

export type FollowupList = {
  rows: FollowupRow[];
  total: number;
  page: number;
  totalPages: number;
  kpis: {
    dueToday: number;
    overdue: number;
    inProgress: number;
    completed30d: number;
    unreachable: number;
  };
  created: number;
};

export type CustomerRow = {
  key: string;
  name: string;
  crrCustomerId: number | null;
  aliases: string[];
  orders12m: number;
  value12m: string;
  ordersAll: number;
  avgRating: number | null;
  ratedCount: number;
  ratingTrend: number | null;
  openIssues: number;
  totalIssues: number;
  lastContacted: string | null;
  lastOrderDate: string | null;
  firstOrderDate: string | null;
  reorderIntent: ReorderIntent | null;
  followupsDue: number;
};

export type CustomerSort = "value" | "rating" | "issues" | "orders" | "name" | "newest" | "oldest";

export type CustomerList = {
  rows: CustomerRow[];
  total: number;
  page: number;
  totalPages: number;
  kpis: {
    customers: number;
    linked: number;
    unlinked: number;
    rated: number;
    atRisk: number;
  };
};

export type CustomerSignal = "at_risk" | "unhappy" | "reorder" | "sample" | "none";

export function customerSignal(r: {
  avgRating: number | null;
  openIssues: number;
  reorderIntent: ReorderIntent | null;
}): CustomerSignal {
  if (r.openIssues > 0 && r.avgRating !== null && r.avgRating <= 3) return "at_risk";
  if (r.openIssues > 0) return "unhappy";
  if (r.avgRating !== null && r.avgRating <= 2) return "at_risk";
  if (r.reorderIntent === "sample_requested") return "sample";
  if (r.reorderIntent === "yes" || r.reorderIntent === "maybe") return "reorder";
  return "none";
}

export const CUSTOMER_SIGNAL_LABEL: Record<CustomerSignal, string> = {
  at_risk: "At risk",
  unhappy: "Open complaint",
  reorder: "Reorder",
  sample: "Sample asked",
  none: "—",
};

export type CrmAnalytics = {
  window: { from: string | null; to: string | null };
  coverage: { followups: number; contacted: number; pct: number | null };
  funnel: {
    due: number;
    inProgress: number;
    completed: number;
    unreachable: number;
    notRequired: number;
  };
  ratings: {
    rated: number;
    avgOverall: number | null;
    escalated: number;
    trend: { month: string; avg: number; n: number }[];
    subs: { key: string; label: string; avg: number; n: number }[];
  };
  onTime: {
    bothOnTime: number;
    bothLate: number;
    weLateTheyFine: number;
    weOnTimeTheyNot: number;
  };
  complaints: {
    total: number;
    open: number;
    byCategory: { key: string; count: number }[];
    byDept: { key: string; count: number }[];
    byTransport: { key: string; count: number }[];
    medianTatDays: number | null;
    ratePer100: number | null;
  };
  reorder: { yes: number; maybe: number; sample: number };
  sampleSize: number;
};

export type CallRecord = {
  followupId: string;
  orderId: string;
  orderNo: string;
  partyName: string;
  crrCustomerId: number | null;
  salesPerson: string | null;
  status: FollowupStatus;
  deliveredAt: string | null;
  contactedAt: string | null;
  completedBy: string | null;
  attempts: number;
  channels: string[];
  customerSaysOnTime: boolean | null;
  delayReason: string | null;
  ratingOverall: number | null;
  ratingSource: string | null;
  subRatings: { key: string; label: string; value: number }[];
  feedback: string | null;
  reorderIntent: ReorderIntent;
  reorderNote: string | null;
  issues: number;
  openIssues: number;
  orderValue: number;
  isEscalated: boolean;
};

export type CallList = {
  rows: CallRecord[];
  total: number;
  page: number;
  totalPages: number;
  kpis: {
    calls: number;
    withFeedback: number;
    reorderSignals: number;
    escalated: number;
  };
};
