CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`plate` text NOT NULL,
	`province` text NOT NULL,
	`model` text NOT NULL,
	`services` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`member_key` text,
	`slip_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`years` integer,
	`start` text,
	`consent` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_records_owner_created` ON `records` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`month` integer NOT NULL,
	`due` text NOT NULL,
	`kind` text NOT NULL,
	`completed` text,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_visits_record` ON `visits` (`record_id`);