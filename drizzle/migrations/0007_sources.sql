CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'youtube' NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`handle` text,
	`channel_id` text,
	`genre` text NOT NULL,
	`description` text,
	`avatar_url` text,
	`vendor_id` text,
	`affiliation` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);--> statement-breakpoint
CREATE INDEX `sources_genre_idx` ON `sources` (`genre`);