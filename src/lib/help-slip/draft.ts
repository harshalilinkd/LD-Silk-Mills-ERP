import type { ConcernPriority } from "@/db/help-slip/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A half-written concern, kept on the device.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the standalone app's `src/features/concerns/draft.ts`. It exists
 * for one reason: a phone call, a low-battery kill or a stray back gesture
 * must not cost somebody the paragraph they just typed one-handed, standing at
 * a loom.
 *
 * ── WHY localStorage IS ALLOWED HERE ──────────────────────────────────────
 *
 * The house rule is no localStorage for anything security-relevant. A draft
 * concern is the user's own words on their own device, so it is not a
 * credential — but it is not nothing either. It can name a colleague, and with
 * the confidential box ticked it is explicitly the sort of thing somebody only
 * wants an admin to read.
 *
 * ── TWO DELIBERATE DIFFERENCES FROM THE SOURCE ────────────────────────────
 *
 * 1. **The key is a hash, not a profile id.** The source keys on
 *    `profile.id`, a uuid it has in the browser. This shell deliberately does
 *    NOT ship a profile id to the client (see the note on
 *    `HelpSlipClientSession`), so the only stable per-person handle available
 *    is the email — and writing an email address into a localStorage key on a
 *    SHARED factory phone would tell the next person who used it last. So the
 *    email is folded into a short non-reversible-enough digest instead: it
 *    separates two people's drafts, which is all the key has to do, and it
 *    names neither of them.
 *
 * 2. **Drafts expire.** The source refuses to save at all on a shared-device
 *    session (its D2 flag) and clears every draft on sign-out. This shell has
 *    neither a shared-device flag nor a sign-out hook to attach to, so the
 *    substitute is an age limit: a draft older than `MAX_AGE_DAYS` is dropped
 *    on load rather than offered. It is weaker than the source's rule and is
 *    written down as such — see the port notes.
 *
 * Every entry point is wrapped in try/catch. Private mode throws on read,
 * a full quota throws on write, and an embedded webview can throw on either.
 * A draft is a convenience; losing the ability to keep one must never break
 * the form.
 */

/** Exactly what the raise form holds, and nothing derived. */
export type ConcernDraft = {
  departmentId: string;
  filedForName: string;
  title: string;
  /** 1..3 entries, in slip order. Empty strings are kept so boxes reopen. */
  solutions: string[];
  priority: ConcernPriority;
  confidential: boolean;
};

const PREFIX = "ld-help-slip.draft.concern.";

/** Older shapes are discarded rather than migrated. A draft is worth minutes. */
const VERSION = 1;

/** Past this a draft is somebody else's problem, or nobody's. */
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

type StoredDraft = {
  v: number;
  savedAt: number;
  values: ConcernDraft;
};

/**
 * A short, stable, non-identifying digest of the signed-in email.
 *
 * djb2 over the lower-cased address, in base 36. It is NOT a security
 * primitive and is not used as one — it only has to keep two people's drafts
 * on one phone from overwriting each other while leaving no address on disk.
 */
export function draftKeyFor(email: string): string {
  const s = email.trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return `${PREFIX}${h.toString(36)}`;
}

/**
 * A department alone does not count: it is PREFILLED from the profile, so
 * treating it as content would offer to restore a form nobody typed into.
 */
export function hasContent(values: ConcernDraft): boolean {
  if (values.title.trim()) return true;
  if (values.filedForName.trim()) return true;
  if (values.solutions.some((s) => s.trim())) return true;
  return false;
}

export function saveDraft(key: string, values: ConcernDraft): void {
  try {
    const payload: StoredDraft = { v: VERSION, savedAt: Date.now(), values };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Private mode, or the quota is full. Nothing to do and nothing to say:
    // the form still works, it just will not survive being killed.
  }
}

export type LoadedDraft = { values: ConcernDraft; savedAt: number };

export function loadDraft(key: string): LoadedDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredDraft | null;
    if (!parsed || parsed.v !== VERSION || !parsed.values) return null;

    // Stale. Dropped rather than offered — and removed, so the offer does not
    // come back on the next mount either.
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearDraft(key);
      return null;
    }

    const values = normalise(parsed.values);
    // An empty draft is not a draft. Without this the restore bar appears for
    // anyone who has ever opened the form and walked away.
    if (!hasContent(values)) return null;

    return { values, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/**
 * Anything read back off a disk somebody else can write to is UNTRUSTED.
 *
 * A hand-edited entry could carry a number where a string belongs, or forty
 * solutions, and the form would then feed that straight into a controlled
 * input. Everything is coerced to the shape the form expects before it is
 * offered — the schema still refuses it on submit, but a restore must not be
 * able to break the screen before anyone gets that far.
 */
function normalise(values: ConcernDraft): ConcernDraft {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const solutions = Array.isArray(values.solutions)
    ? values.solutions.slice(0, 3).map(str)
    : [];
  return {
    departmentId: str(values.departmentId),
    filedForName: str(values.filedForName),
    title: str(values.title),
    solutions: solutions.length > 0 ? solutions : [""],
    priority: isPriority(values.priority) ? values.priority : "normal",
    confidential: values.confidential === true,
  };
}

const PRIORITY_SET = new Set(["low", "normal", "high", "urgent"]);

function isPriority(v: unknown): v is ConcernPriority {
  return typeof v === "string" && PRIORITY_SET.has(v);
}
