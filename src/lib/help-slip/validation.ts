import { z } from "zod";
import {
  CONCERN_STATUSES,
  PRIORITIES,
  WAIT_REASONS,
} from "@/db/help-slip/schema";
import { RESOLUTION_MIN } from "./state-machine";

// Ported from the source app's `src/features/concerns/schema.ts`, with the same
// limits and the same asymmetry between the first proposed solution and the
// rest.
//
// The source's messages are TRANSLATION KEYS, resolved by a `t()` in the screen
// so a Hindi reader never meets an English validation error at the moment the
// form refuses them. This port renders EN + HI inline rather than carrying a
// dictionary, so the messages here are plain English sentences and the screens
// pair them with Hindi where they surface. Either way the rule is the same: a
// refusal is copy, and it gets written like copy.

/** Advice, not a limit — the field warns past this and still accepts. */
export const TITLE_SOFT_MAX = 60;
/** The point at which a title has become the description. */
export const TITLE_HARD_MAX = 140;
export const SOLUTION_MAX = 500;
/** Three, because the paper HELP SLIP has three lines. Not arbitrary. */
export const MAX_SOLUTIONS = 3;

export const raiseConcernSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    departmentId: z.string().uuid({ message: "Choose a department." }),
    // Free text, and NOT who the concern belongs to — `employee_id` is that,
    // taken from auth.uid() in the database. This is only what was written on
    // the slip, for the everyday case of one person filing for another.
    filedForName: z
      .string()
      .trim()
      .max(120, { message: "That name is too long." })
      .optional(),
    title: z
      .string()
      .trim()
      .min(1, { message: "Give it a short title." })
      .max(TITLE_HARD_MAX, { message: "That title is too long." }),
    solutions: z
      .array(z.string().max(SOLUTION_MAX, { message: "That suggestion is too long." }))
      .min(1)
      .max(MAX_SOLUTIONS),
    priority: z.enum(PRIORITIES),
    /** Maps to visibility='hr_only'. The column is the enum; this is not. */
    confidential: z.boolean(),
  })
  .superRefine((v, ctx) => {
    // The first is required and the others are not. That asymmetry IS the
    // product: the slip asks for up to three fixes and insists on one, because
    // a problem reported with no proposed fix is the thing this replaces.
    if ((v.solutions[0] ?? "").trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["solutions", 0],
        message: "Suggest at least one way to fix it.",
      });
    }
  });
export type RaiseConcernInput = z.infer<typeof raiseConcernSchema>;

/**
 * Every write a concern's page can make, as one discriminated union.
 *
 * One union, so the workspace's disabled buttons and the route's refusals are
 * read off the same table and cannot drift apart. `applyConcernAction` in
 * `mutations.ts` dispatches on `action` and re-checks each move against
 * `state-machine.ts` before writing.
 */
export const concernActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("comment"),
    message: z
      .string()
      .trim()
      .min(1, { message: "Write something first." })
      .max(4000),
    // The ONLY member an employee may send, and only ever with this false —
    // enforced in the route, not here, because the schema does not know who is
    // asking. An internal note reaching an employee is the disclosure this
    // whole module is careful about.
    isInternal: z.boolean().default(false),
  }),
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("assign"),
    // null unassigns.
    assigneeId: z.string().uuid().nullable(),
  }),
  z.object({ action: z.literal("priority"), priority: z.enum(PRIORITIES) }),
  z.object({
    action: z.literal("hold"),
    reason: z.enum(WAIT_REASONS),
    // The database refuses a `waiting` row with no wait_reason, but it does not
    // enforce the note — that rule lives here, because a concern going quiet
    // with no explanation is exactly what a hold is meant to avoid.
    note: z.string().trim().min(1, { message: "Say what it is waiting for." }).max(4000),
  }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("resolve"),
    // "Done" is not an answer. The resolution message is the whole of what the
    // employee gets back, so it has a floor the rest of the app does not.
    resolution: z
      .string()
      .trim()
      .min(RESOLUTION_MIN, { message: "Say what was actually done." })
      .max(4000),
    /** Which of the employee's own proposals was accepted, if any. */
    acceptedSolutionId: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal("reopen"),
    note: z.string().trim().min(1, { message: "Say why it is being reopened." }).max(4000),
  }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("withdraw") }),
]);
export type ConcernAction = z.infer<typeof concernActionSchema>;

export const withdrawManySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const statusSchema = z.object({ status: z.enum(CONCERN_STATUSES) });

/** First human-readable message from a ZodError, for `{ error }` responses. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That didn't look right.";
  return issue.message;
}
