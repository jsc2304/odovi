ALTER TABLE "charge_sessions" ADD COLUMN "end_rated_range_km" double precision;
--> statement-breakpoint
-- Re-read charging history once to populate independent BMS range observations.
UPDATE "sync_state" SET "watermark_ts" = NULL WHERE "source" = 'teslamate' AND "entity" = 'charges';
