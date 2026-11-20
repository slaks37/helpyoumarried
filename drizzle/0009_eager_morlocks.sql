CREATE TABLE `journey_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_key` text NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`before_value` text NOT NULL,
	`after_value` text NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journey_activity_date_idx` ON `journey_activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `journey_attendance` (
	`subject_key` text NOT NULL,
	`event_id` text NOT NULL,
	`invitation_id` text,
	`general_owner` text,
	`checked_in` integer DEFAULT 0 NOT NULL,
	`seated` integer DEFAULT 0 NOT NULL,
	`souvenirs` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`subject_key`, `event_id`),
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`general_owner`) REFERENCES `general_rsvps`(`owner_hash`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "journey_event_check" CHECK("journey_attendance"."event_id" in ('ceremony','reception','celebration')),
	CONSTRAINT "journey_count_check" CHECK("journey_attendance"."checked_in" between 0 and 20),
	CONSTRAINT "journey_seated_check" CHECK("journey_attendance"."seated" between 0 and "journey_attendance"."checked_in"),
	CONSTRAINT "journey_souvenirs_check" CHECK("journey_attendance"."souvenirs" between 0 and "journey_attendance"."checked_in")
);
--> statement-breakpoint
CREATE INDEX `journey_attendance_invitation_idx` ON `journey_attendance` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `journey_attendance_general_idx` ON `journey_attendance` (`general_owner`);--> statement-breakpoint
CREATE TABLE `journey_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`family_name` text NOT NULL,
	`members` text DEFAULT '' NOT NULL,
	`invitation_id` text,
	`assignee` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`scheduled_at` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "journey_task_event_check" CHECK("journey_tasks"."event_id" in ('ceremony','reception','celebration')),
	CONSTRAINT "journey_task_kind_check" CHECK("journey_tasks"."kind" in ('coordination','tea','photo')),
	CONSTRAINT "journey_task_status_check" CHECK("journey_tasks"."status" in ('planned','ready','active','done','cancelled')),
	CONSTRAINT "journey_task_position_check" CHECK("journey_tasks"."position" between 1 and 999)
);
--> statement-breakpoint
CREATE INDEX `journey_tasks_event_order_idx` ON `journey_tasks` (`event_id`,`position`);--> statement-breakpoint
CREATE INDEX `journey_tasks_invitation_idx` ON `journey_tasks` (`invitation_id`);