CREATE TABLE `waitlist_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`interest` text DEFAULT 'hosted' NOT NULL,
	`teslamate_experience` text DEFAULT 'no' NOT NULL,
	`consent` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_waitlist_email` ON `waitlist_entries` (`email`);
--> statement-breakpoint
PRAGMA optimize;
