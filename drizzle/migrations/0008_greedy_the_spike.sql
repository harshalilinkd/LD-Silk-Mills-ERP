CREATE TABLE "ld_petty_cash"."entry_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" bigint NOT NULL,
	"file_path" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size_bytes" bigint,
	"mime_type" varchar(150),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."entry_attachments" ADD CONSTRAINT "entry_attachments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "ld_petty_cash"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ld_petty_cash"."entry_attachments" ADD CONSTRAINT "entry_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "ld_erp_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pc_entry_attachments_txn" ON "ld_petty_cash"."entry_attachments" USING btree ("transaction_id");