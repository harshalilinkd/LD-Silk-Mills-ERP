ALTER TABLE "ld_erp_core"."users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "ld_erp_core"."users" ADD COLUMN "password_set_at" timestamp with time zone;