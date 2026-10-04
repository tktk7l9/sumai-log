CREATE TABLE `channel_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel` text NOT NULL,
	`vendor_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`duration_sec` integer,
	`view_count` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`watched_at` text,
	`watched_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_videos_video_id_unique` ON `channel_videos` (`video_id`);--> statement-breakpoint
CREATE INDEX `channel_videos_channel_idx` ON `channel_videos` (`channel_id`,`sort_order`);