CREATE SCHEMA "ld_checklist_system";
--> statement-breakpoint
CREATE TYPE "ld_checklist_system"."frequency" AS ENUM('D', 'W', 'F', 'M', 'Q', 'Y', 'SM', 'E1ST', 'E2ND', 'E3RD', 'E4TH', 'ELAST');--> statement-breakpoint
CREATE TYPE "ld_checklist_system"."occurrence_status" AS ENUM('Scheduled', 'Done');--> statement-breakpoint
CREATE TABLE "ld_checklist_system"."holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"holiday_date" date NOT NULL,
	"name" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_holiday_date_unique" UNIQUE("holiday_date")
);
--> statement-breakpoint
CREATE TABLE "ld_checklist_system"."members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"department" varchar(120),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ld_checklist_system"."occurrences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurrence_key" varchar(80) NOT NULL,
	"task_id" integer NOT NULL,
	"doer_id" uuid NOT NULL,
	"task_name" varchar(300) NOT NULL,
	"frequency" "ld_checklist_system"."frequency" NOT NULL,
	"planned_date" date NOT NULL,
	"actual_date" date,
	"completed_by" uuid,
	"status" "ld_checklist_system"."occurrence_status" DEFAULT 'Scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ld_checklist_system"."tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(300) NOT NULL,
	"doer_id" uuid NOT NULL,
	"frequency" "ld_checklist_system"."frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"assigned_by" uuid,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ld_checklist_system"."members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_checklist_system"."occurrences" ADD CONSTRAINT "occurrences_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "ld_checklist_system"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_checklist_system"."occurrences" ADD CONSTRAINT "occurrences_doer_id_users_id_fk" FOREIGN KEY ("doer_id") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_checklist_system"."occurrences" ADD CONSTRAINT "occurrences_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_checklist_system"."tasks" ADD CONSTRAINT "tasks_doer_id_users_id_fk" FOREIGN KEY ("doer_id") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_checklist_system"."tasks" ADD CONSTRAINT "tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_holidays_date" ON "ld_checklist_system"."holidays" USING btree ("holiday_date");--> statement-breakpoint
CREATE INDEX "idx_members_active" ON "ld_checklist_system"."members" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occurrence_key" ON "ld_checklist_system"."occurrences" USING btree ("occurrence_key");--> statement-breakpoint
CREATE INDEX "idx_occ_planned" ON "ld_checklist_system"."occurrences" USING btree ("planned_date");--> statement-breakpoint
CREATE INDEX "idx_occ_doer_planned" ON "ld_checklist_system"."occurrences" USING btree ("doer_id","planned_date");--> statement-breakpoint
CREATE INDEX "idx_occ_task" ON "ld_checklist_system"."occurrences" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_doer" ON "ld_checklist_system"."tasks" USING btree ("doer_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_active" ON "ld_checklist_system"."tasks" USING btree ("active");