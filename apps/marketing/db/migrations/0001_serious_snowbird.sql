ALTER TABLE `waitlist_entries` ADD `consent_version` text DEFAULT 'legacy-pre-2026-08-22' NOT NULL;--> statement-breakpoint
ALTER TABLE `waitlist_entries` ADD `consented_at` text DEFAULT '2026-08-22' NOT NULL;--> statement-breakpoint
UPDATE `waitlist_entries`
SET `consented_at` = COALESCE(`updated_at`, `created_at`)
WHERE `consented_at` = '2026-08-22';
