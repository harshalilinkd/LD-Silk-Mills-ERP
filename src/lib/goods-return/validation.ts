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

/**
 * FormData -> a validated `ReturnInput`, or a sentence explaining why not.
 *
 * Ported from the standalone app's `lib/return-form.ts`, which an adversarial
 * review found had been left behind. Without it every screen that submits the
 * entry form would hand-roll its own mapping, and the two would drift — the
 * quality lines especially, which travel as a JSON string in a hidden field
 * because a repeating row group has no native FormData representation.
 *
 * `?? undefined` on every optional field is load-bearing: `formData.get()`
 * returns `null` for an absent field, and the schema's preprocessing turns ""
 * and null into undefined so an untouched box stays empty rather than becoming
 * 0. Reading a missing field as `null` and passing it through would make
 * `optionalNumber` coerce it to 0, and a transport charge nobody entered would
 * be recorded as "charged nothing".
 */
export function parseReturnFormData(
  formData: FormData,
): { data: ReturnInput; error?: undefined } | { data?: undefined; error: string } {
  let itemsRaw: unknown = [];
  try {
    itemsRaw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Could not read quality lines." };
  }

  const parsed = returnInputSchema.safeParse({
    billNo: formData.get("billNo") ?? undefined,
    entryFor: formData.get("entryFor"),
    trackingNo: formData.get("trackingNo") ?? undefined,
    dated: formData.get("dated"),
    postedOn: formData.get("postedOn") ?? undefined,
    partyId: formData.get("partyId"),
    brokerId: formData.get("brokerId"),
    transportId: formData.get("transportId") ?? undefined,
    totalValue: formData.get("totalValue") ?? undefined,
    transportValue: formData.get("transportValue") ?? undefined,
    otherCharges: formData.get("otherCharges") ?? undefined,
    returnReason: formData.get("returnReason"),
    customReason: formData.get("customReason") ?? undefined,
    items: itemsRaw,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  return { data: parsed.data };
}
