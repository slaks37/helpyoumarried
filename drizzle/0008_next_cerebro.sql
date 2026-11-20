CREATE TABLE `reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text,
	`visitor_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`max_depth` integer NOT NULL,
	`sections_mask` integer NOT NULL,
	`deepest_section` integer NOT NULL,
	`last_section` integer NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_progress_session_idx` ON `reading_progress` (`visitor_hash`,`session_id`);--> statement-breakpoint
CREATE INDEX `reading_progress_invitation_idx` ON `reading_progress` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `reading_progress_visitor_date_idx` ON `reading_progress` (`visitor_hash`,`created_at`);