CREATE TYPE "ld_erp_core"."user_role" AS ENUM('member', 'admin');--> statement-breakpoint
ALTER TABLE "ld_erp_core"."users" ADD COLUMN "role" "ld_erp_core"."user_role" DEFAULT 'member' NOT NULL;