import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Shared connection — reused by src/db/order-entry/index.ts too, so both
// schemas (ld_erp_core and ld_order_entry, same Supabase project) go through
// one connection pool instead of two. DATABASE_URL must point at Supabase's
// Supavisor TRANSACTION pooler (port 6543), never the session pooler (5432)
// — session mode holds one backend connection per client for its whole
// lifetime and exhausts the pool fast. `prepare: false` is required on the
// transaction pooler (a different backend connection can back each
// transaction, so prepared statements can't be reused). Pool size/timeouts
// match what Order Entry's own lib/db.ts uses against this same pooler.
export const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });
