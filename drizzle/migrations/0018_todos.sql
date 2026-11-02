CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`list` text DEFAULT 'other' NOT NULL,
	`assignee` text,
	`due_on` text,
	`done_at` text,
	`done_by` text,
	`url` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `todos_due_idx` ON `todos` (`due_on`);--> statement-breakpoint
CREATE INDEX `todos_done_idx` ON `todos` (`done_at`);