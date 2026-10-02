CREATE TABLE "invoice_uploads" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_uploads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"original" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" text NOT NULL,
	CONSTRAINT "invoice_uploads_hash_uq" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"upload_id" bigint NOT NULL,
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"original" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"extracted_text" text NOT NULL,
	"parsed_metadata" jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"reviewed_metadata" jsonb,
	"charge_session_id" bigint,
	"enrichment" jsonb,
	CONSTRAINT "invoices_hash_uq" UNIQUE("sha256"),
	CONSTRAINT "invoices_charge_uq" UNIQUE("charge_session_id")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_upload_id_invoice_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."invoice_uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_charge_session_id_charge_sessions_id_fk" FOREIGN KEY ("charge_session_id") REFERENCES "public"."charge_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_upload_idx" ON "invoices" USING btree ("upload_id");
