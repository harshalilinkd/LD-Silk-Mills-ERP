// The two-line fetch helpers every CRM client screen uses — docs/SCREENS.md §0.6
//
// The API contract is `{ data }` on success and `{ error }` on failure, so a
// helper that unwraps `data` and THROWS the server's own sentence is what makes
// TanStack Query's `isError` branch able to print something a coordinator can
// act on. Without it every screen would re-implement the same
// `res.json().catch(() => null)` dance and the error states would drift.
//
// Scoped to the CRM module (the shell has no global api-client); Order Entry's
// screens do the same thing inline.

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | { data?: unknown; error?: string }
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body?.data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url));
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  return unwrap<T>(
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
