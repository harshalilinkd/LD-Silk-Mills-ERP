import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  // Every OWNED schema. Adding a file here is what lets `db:generate` see its
  // tables at all — schemaFilter alone only decides which namespaces
  // drizzle-kit may touch, not which files it reads.
  schema: [
    "./src/db/schema.ts",
    "./src/db/checklist/schema.ts",
    "./src/db/petty-cash/schema.ts",
  ],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  // These schemas are OWNED by this repo and nothing else reads or writes
  // them, so drizzle-kit may manage them. Every other schema this app touches
  // (ld_order_entry, ld_help_slip, goods_return) is shared with a live
  // standalone app and is deliberately absent — a migration generated against
  // one of those could drop a table another application depends on.
  schemaFilter: ["ld_erp_core", "ld_checklist_system", "ld_petty_cash"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
