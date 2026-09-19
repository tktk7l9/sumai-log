CREATE TABLE `inbound_mails` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`received_at` text NOT NULL,
	`from_address` text NOT NULL,
	`forwarded_by` text,
	`subject` text NOT NULL,
	`sent_on` text,
	`body_text` text,
	`body_truncated` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`reject_reason` text,
	`vendor_id` text,
	`news_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`news_id`) REFERENCES `vendor_news`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_mails_message_id_unique` ON `inbound_mails` (`message_id`);--> statement-breakpoint
CREATE INDEX `inbound_mails_status_received_idx` ON `inbound_mails` (`status`,`received_at`);--> statement-breakpoint
ALTER TABLE `vendor_news` ADD `mail_id` text REFERENCES inbound_mails(id);--> statement-breakpoint
ALTER TABLE `vendors` ADD `news_email_domain` text;