import { drizzle } from "drizzle-orm/postgres-js";

import { sql } from "@/db";
import * as goodsReturnSchema from "./schema";

/**
 * The Goods Return Drizzle instance, on the ONE shared connection.
 *
 * Same shape as `src/db/order-entry/index.ts`: one `postgres.js` pool for the
 * whole app, several Drizzle instances over it. Opening a second pool here
 * would be the fastest way to break every page — Supavisor's transaction pool
 * is 15 server connections for the entire Supabase project, shared with Order
 * Entry, CRM and Help Slip.
 *
 * The pool is capped at 5 (see `src/db/index.ts`), and the rule that comes with
 * it applies to every screen in this module: keep any single page's CONCURRENT
 * query count at 4 or below. Above that, postgres.js pipelines the overflow
 * onto a busy connection, and pipelined statements stall under transaction
 * pooling — the query runs, the answer never comes back, and the page hangs
 * forever rather than erroring. The standalone app hit exactly this with a
 * seven-query dashboard; its Reports code runs sequentially for that reason.
 */
export const goodsReturnDb = drizzle(sql, { schema: goodsReturnSchema });

export { goodsReturnSchema };
