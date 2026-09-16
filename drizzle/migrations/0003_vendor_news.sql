CREATE TABLE `vendor_news` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`published_on` text NOT NULL,
	`event_start` text,
	`event_end` text,
	`event_kind` text,
	`planned_event_id` text,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendor_news_url_unique` ON `vendor_news` (`url`);--> statement-breakpoint
CREATE INDEX `vendor_news_vendor_published_idx` ON `vendor_news` (`vendor_id`,`published_on`);--> statement-breakpoint
ALTER TABLE `vendors` ADD `news_url` text;--> statement-breakpoint
ALTER TABLE `vendors` ADD `news_source` text;--> statement-breakpoint
ALTER TABLE `vendors` ADD `news_fetched_at` text;--> statement-breakpoint
ALTER TABLE `vendors` ADD `news_fetch_error` text;