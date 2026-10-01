CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`site` text NOT NULL,
	`vendor_id` text,
	`title` text NOT NULL,
	`category` text,
	`location` text,
	`completed_on` text,
	`points` text DEFAULT '[]' NOT NULL,
	`ua_value` real,
	`c_value` real,
	`family` text,
	`site_area_tsubo` real,
	`floor_area_tsubo` real,
	`total_area_tsubo` real,
	`layout` text,
	`youtube_video_id` text,
	`video_source` text,
	`watched_at` text,
	`watched_by` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `works_source_url_unique` ON `works` (`source_url`);--> statement-breakpoint
CREATE INDEX `works_vendor_idx` ON `works` (`vendor_id`);