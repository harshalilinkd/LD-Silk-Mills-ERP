CREATE SCHEMA "ld_erp_core";
--> statement-breakpoint
CREATE TYPE "ld_erp_core"."open_mode" AS ENUM('internal', 'external');--> statement-breakpoint
CREATE TYPE "ld_erp_core"."system_category" AS ENUM('sales', 'operations', 'finance', 'reports', 'admin');--> statement-breakpoint
CREATE TYPE "ld_erp_core"."system_status" AS ENUM('active', 'coming_soon', 'maintenance');--> statement-breakpoint
CREATE TYPE "ld_erp_core"."user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "ld_erp_core"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar NOT NULL,
	"system_code" varchar,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ld_erp_core"."system_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_access_user_id_system_id_unique" UNIQUE("user_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "ld_erp_core"."systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_code" varchar NOT NULL,
	"system_name" varchar NOT NULL,
	"category" "ld_erp_core"."system_category" NOT NULL,
	"description" text,
	"icon" varchar,
	"route" varchar,
	"application_url" text,
	"status" "ld_erp_core"."system_status" DEFAULT 'coming_soon' NOT NULL,
	"open_mode" "ld_erp_core"."open_mode" DEFAULT 'external' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "systems_system_code_unique" UNIQUE("system_code")
);
--> statement-breakpoint
CREATE TABLE "ld_erp_core"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"avatar" text,
	"status" "ld_erp_core"."user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ld_erp_core"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_erp_core"."system_access" ADD CONSTRAINT "system_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_erp_core"."system_access" ADD CONSTRAINT "system_access_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "ld_erp_core"."systems"("id") ON DELETE no action ON UPDATE no action;