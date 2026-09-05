CREATE SCHEMA "ld_petty_cash";
--> statement-breakpoint
CREATE TYPE "ld_petty_cash"."member_role" AS ENUM('VIEWER', 'OPERATOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "ld_petty_cash"."proof_type" AS ENUM('NONE', 'VOUCHER', 'BILL', 'OTHER');--> statement-breakpoint
CREATE TYPE "ld_petty_cash"."transaction_type" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TABLE "ld_petty_cash"."categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"group_name" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ld_petty_cash"."employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(40),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ld_petty_cash"."members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "ld_petty_cash"."member_role" DEFAULT 'VIEWER' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ld_petty_cash"."transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uid" varchar(24) NOT NULL,
	"transaction_date" date NOT NULL,
	"transaction_type" "ld_petty_cash"."transaction_type" NOT NULL,
	"from_name" varchar(160),
	"employee_id" integer NOT NULL,
	"to_name" varchar(160) NOT NULL,
	"category_id" integer NOT NULL,
	"category_name" varchar(80) NOT NULL,
	"reason" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"proof_type" "ld_petty_cash"."proof_type" DEFAULT 'NONE' NOT NULL,
	"proof_other" varchar(60),
	"attachment_path" text,
	"attachment_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "ck_pc_amount_positive" CHECK ("ld_petty_cash"."transactions"."amount" > 0),
	CONSTRAINT "ck_pc_proof_other" CHECK (("ld_petty_cash"."transactions"."proof_type" = 'OTHER' and "ld_petty_cash"."transactions"."proof_other" is not null and length(btrim("ld_petty_cash"."transactions"."proof_other")) > 0)
          or ("ld_petty_cash"."transactions"."proof_type" <> 'OTHER' and "ld_petty_cash"."transactions"."proof_other" is null)),
	CONSTRAINT "ck_pc_attachment_pair" CHECK (("ld_petty_cash"."transactions"."attachment_path" is null) = ("ld_petty_cash"."transactions"."attachment_name" is null))
);
--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."employees" ADD CONSTRAINT "employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."transactions" ADD CONSTRAINT "transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "ld_petty_cash"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "ld_petty_cash"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."transactions" ADD CONSTRAINT "transactions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."transactions" ADD CONSTRAINT "transactions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pc_category_name" ON "ld_petty_cash"."categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "idx_pc_category_active" ON "ld_petty_cash"."categories" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pc_employee_name" ON "ld_petty_cash"."employees" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "idx_pc_employee_active" ON "ld_petty_cash"."employees" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pc_member_user" ON "ld_petty_cash"."members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pc_txn_uid" ON "ld_petty_cash"."transactions" USING btree ("uid");--> statement-breakpoint
CREATE INDEX "idx_pc_txn_date" ON "ld_petty_cash"."transactions" USING btree ("transaction_date","id");--> statement-breakpoint
CREATE INDEX "idx_pc_txn_live_date" ON "ld_petty_cash"."transactions" USING btree ("deleted_at","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_pc_txn_type" ON "ld_petty_cash"."transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "idx_pc_txn_category" ON "ld_petty_cash"."transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_pc_txn_employee" ON "ld_petty_cash"."transactions" USING btree ("employee_id");