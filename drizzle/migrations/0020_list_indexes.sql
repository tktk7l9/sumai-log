CREATE INDEX `photos_created_idx` ON `photos` (`created_at`);--> statement-breakpoint
CREATE INDEX `vendor_news_published_idx` ON `vendor_news` (`published_on`,`first_seen_at`);--> statement-breakpoint
CREATE INDEX `visits_place_idx` ON `visits` (`place_id`);