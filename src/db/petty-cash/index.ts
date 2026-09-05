import { drizzle } from "drizzle-orm/postgres-js";

import { sql } from "@/db";
import * as pettyCashSchema from "./schema";

/**
 * The Petty Cash Drizzle instance, on the ONE shared connection.
 *
 * Same shape as every other module: one `postgres.js` pool for the whole app,
 * several Drizzle instances over it. The pool is capped at 5 — keep any single
 * page's CONCURRENT query count at 4 or below, for the reason written at
 * length in `src/db/index.ts`.
 */
export const pettyCashDb = drizzle(sql, { schema: pettyCashSchema });

export { pettyCashSchema };
