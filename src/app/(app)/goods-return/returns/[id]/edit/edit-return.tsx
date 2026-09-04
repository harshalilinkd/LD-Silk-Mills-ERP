"use client";

import { ReturnForm, type FormValues } from "../../return-form";
import { updateReturn } from "./actions";

/**
 * Binds the shared form to one record.
 *
 * A thin client wrapper only because the form's `submit` prop is a function and
 * the page is a server component — the id has to be closed over somewhere, and
 * doing it here keeps the page itself free of "use client".
 *
 * The hidden `returnId` is what the action checks against the id in the URL, so
 * a tab left open on one return cannot post its contents onto another.
 */
export function EditReturn({
  id,
  initial,
}: {
  id: number;
  initial: FormValues;
}) {
  return (
    <>
      <ReturnForm
        mode="edit"
        initial={initial}
        submit={async (fd) => {
          fd.set("returnId", String(id));
          return updateReturn(id, fd);
        }}
      />
    </>
  );
}
