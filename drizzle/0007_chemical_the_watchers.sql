CREATE TABLE `gift_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text,
	`visitor_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_activity_request_idx` ON `gift_activity` (`visitor_hash`,`request_id`);--> statement-breakpoint
CREATE INDEX `gift_activity_invitation_idx` ON `gift_activity` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `gift_activity_created_idx` ON `gift_activity` (`created_at`);