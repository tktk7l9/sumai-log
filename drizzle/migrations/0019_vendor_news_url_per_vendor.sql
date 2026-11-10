DROP INDEX `vendor_news_url_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `vendor_news_vendor_url_unique` ON `vendor_news` (`vendor_id`,`url`);