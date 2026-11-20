CREATE TABLE `general_rsvps` (
	`owner_hash` text PRIMARY KEY NOT NULL,
	`guest_name` text NOT NULL,
	`responses` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guest_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`network_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`invitation_id` text,
	`guest_name` text NOT NULL,
	`original` text NOT NULL,
	`language` text DEFAULT 'und' NOT NULL,
	`translation_id` text DEFAULT '' NOT NULL,
	`translation_en` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_messages_request_idx` ON `guest_messages` (`owner_hash`,`request_id`);--> statement-breakpoint
CREATE INDEX `guest_messages_public_idx` ON `guest_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_messages_network_idx` ON `guest_messages` (`network_hash`,`created_at`);