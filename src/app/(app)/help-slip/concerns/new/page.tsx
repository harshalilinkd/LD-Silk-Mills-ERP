import { RaiseConcern } from "@/components/help-slip/raise-concern";

/**
 * Raise a concern.
 *
 * NOT gated on role, deliberately — the same call `/help-slip/concerns` makes.
 * A coordinator has a leaking fridge and a laptop that will not charge like
 * anybody else, and `raise_concern` takes the filer from `auth.uid()` inside
 * the database whoever is asking.
 *
 * A STATIC segment beside `[id]`, so Next routes `/help-slip/concerns/new`
 * here and never into the detail screen with the literal string "new" as an
 * id. (The detail route would answer that with the same "Not found" as any
 * other unreadable id — see its own note — but arriving there at all would be
 * a bug the reader has to interpret.)
 *
 * No Suspense boundary: the form reads nothing out of `useSearchParams`, so
 * there is nothing for Next to suspend on. Its own loading states — the
 * department list, the submit — live inside the screen where they belong.
 */
export default function HelpSlipRaiseConcernPage() {
  return <RaiseConcern />;
}
