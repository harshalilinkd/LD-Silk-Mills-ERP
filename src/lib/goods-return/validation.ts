// Ported verbatim from the standalone app's `lib/validation.ts` — same rules,
// same messages, same coercions. The standalone app is still live against these
// same tables, so a rule that differs here is a row one app will accept and the
// other will refuse.
//
// Everything this schema parses arrives as STRINGS: the entry form posts
// FormData, so a number box the user never touched arrives as "" and a select
// still on its placeholder arrives as "". That is what shapes the whole file —
// see `emptyToUndefined` and the `positive()` messages below.
import { z } from "zod";
import { ENTRY_FOR_OPTIONS, RETURN_REASONS } from "./constants";

/** "" | null | undefined -> undefined, so optional numbers stay empty. */
const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

// Without the preprocess, `z.coerce.number()` runs Number("") and gets 0 — so
// an untouched Transport Value would be stored as a real 0.00 instead of NULL,
// and "nobody entered this yet" would be indistinguishable from "it cost
// nothing". Those columns are nullable numeric(14,2) precisely so the
// difference survives.
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().optional());
const optionalNonNegInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().nonnegative().optional()
);

export const returnItemSchema = z.object({
  // The messages read as instructions rather than as errors because an empty
  // select coerces to 0, which fails `positive()` — so "Select a quality" is
  // what the user actually needs to be told, not "must be greater than 0".
  qualityId: z.coerce.number().int().positive("Select a quality"),
  quantity: z.coerce.number().positive("Enter a quantity greater than 0"),
  // Pieces genuinely can be 0 (a metre-only return), which is why this one is
  // nonnegative rather than positive.
  pieces: optionalNonNegInt,
});

export const returnInputSchema = z
  .object({
    billNo: z.string().trim().optional(),
    entryFor: z.enum(ENTRY_FOR_OPTIONS),
    trackingNo: z.string().trim().optional(),
    dated: z.string().min(1, "Date is required"),
    // Nullable in the database — the day it was sent to Bhiwandi is often not
    // known at entry, and "" must stay NULL rather than becoming an empty date.
    postedOn: z.preprocess(emptyToUndefined, z.string().optional()),
    partyId: z.coerce.number().int().positive("Select a party"),
    brokerId: z.coerce.number().int().positive("Select a broker"),
    // Optional, unlike the two above: `returns.transport_id` is the one of the
    // three foreign keys that is nullable, because a local delivery has no
    // transporter.
    transportId: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().positive().optional()
    ),
    totalValue: optionalNumber,
    transportValue: optionalNumber,
    otherCharges: optionalNumber,
    returnReason: z.enum(RETURN_REASONS),
    customReason: z.string().trim().optional(),
    items: z.array(returnItemSchema).min(1, "Add at least one quality line"),
  })
  // "Other" with no custom reason is a return whose reason is literally the
  // word "Other" — unreportable, and unanswerable six months later. The column
  // is nullable so the other three reasons need not carry one, which means this
  // rule has nowhere to live except here.
  .refine(
    (d) => d.returnReason !== "Other" || (d.customReason && d.customReason.length > 0),
    { message: "Please specify the reason", path: ["customReason"] }
  );

export type ReturnInput = z.infer<typeof returnInputSchema>;
export type ReturnItemInput = z.infer<typeof returnItemSchema>;
