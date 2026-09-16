ALTER TABLE `vendors` ADD `representative` text;--> statement-breakpoint
ALTER TABLE `vendors` ADD `affiliations` text DEFAULT '[]' NOT NULL;