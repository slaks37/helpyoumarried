ALTER TABLE `invitations` ADD `heart_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `last_heart_at` text;