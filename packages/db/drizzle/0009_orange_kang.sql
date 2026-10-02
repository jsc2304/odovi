CREATE TABLE "classification_operations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "classification_operations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"classification" "drive_classification" NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drives" ADD COLUMN "classification_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classification_operations" ADD CONSTRAINT "classification_operations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_operations" ADD CONSTRAINT "classification_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classification_operations_session_idx" ON "classification_operations" USING btree ("session_id","id");
--> statement-breakpoint
CREATE FUNCTION bump_classification_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.classification_revision := OLD.classification_revision + CASE WHEN NEW.classification IS DISTINCT FROM OLD.classification THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER drives_classification_revision BEFORE UPDATE ON drives
FOR EACH ROW EXECUTE FUNCTION bump_classification_revision();
