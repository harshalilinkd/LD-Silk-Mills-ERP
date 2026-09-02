/**
 * The fetch helpers every Help Slip client screen uses.
 *
 * The API contract is `{ data }` on success and `{ error }` on failure, so a
 * helper that unwraps `data` and throws the server's own sentence is what lets
 * TanStack Query's `isError` branch print something a person can act on.
 *
 * The message it throws is always one the ROUTE wrote (see
 * `withHelpSlipRoute`), never an upstream database or proxy message — the
 * standalone app learned this the hard way when a search string shaped like
 * SQL injection was blocked at the edge, the edge answered with an HTML block
 * page, and the JSON parser's failure message rendered a full error document
 * inside an employee's concern list.
 */

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | { data?: unknown; error?: string }
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body?.data as T;
}

export async function helpSlipGet<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url));
}

export async function helpSlipSend<T>(
  url: string,
  method: "POST" | "PATCH",
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
