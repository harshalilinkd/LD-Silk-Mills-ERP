import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  // The Supabase project is shared with every other LD module — only
  // ever touch the ld_erp_core schema, never public or another
  // module's schema (ld_order_entry, ld_help_slip, ...).
  schemaFilter: ["ld_erp_core"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
