CREATE TABLE `gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'reported' NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gifts_invite_request_unique` ON `gifts` (`invitation_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `gifts_status_idx` ON `gifts` (`status`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`guest_name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`seats` integer DEFAULT 2 NOT NULL,
	`event_ids` text NOT NULL,
	`access_token` text NOT NULL,
	`private_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`shared_at` text,
	`first_opened_at` text,
	`last_opened_at` text,
	`open_count` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_slug_unique` ON `invitations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`access_token`);--> statement-breakpoint
CREATE TABLE `opens` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`opened_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opens_invite_visit_unique` ON `opens` (`invitation_id`,`visit_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`event_id` text NOT NULL,
	`status` text NOT NULL,
	`guest_count` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_invite_event_unique` ON `responses` (`invitation_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `responses_event_status_idx` ON `responses` (`event_id`,`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
