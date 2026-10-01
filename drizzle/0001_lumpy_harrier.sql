CREATE TABLE `line_contacts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`event_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`owner` text NOT NULL,
	`recipient` text NOT NULL,
	`payload` text NOT NULL,
	`retry_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt` text,
	`next_attempt` text,
	`lease_until` text,
	`accepted_at` text,
	`last_error` text,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_status_next` ON `message_outbox` (`status`,`next_attempt`);--> statement-breakpoint
CREATE INDEX `idx_outbox_owner` ON `message_outbox` (`owner`);--> statement-breakpoint
ALTER TABLE `records` ADD `line_user_id` text;