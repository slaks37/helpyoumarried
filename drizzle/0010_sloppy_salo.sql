CREATE TABLE `journey_task_invitations` (
	`task_id` text NOT NULL,
	`invitation_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `invitation_id`),
	FOREIGN KEY (`task_id`) REFERENCES `journey_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journey_task_invitations_invitation_idx` ON `journey_task_invitations` (`invitation_id`);
--> statement-breakpoint
INSERT INTO journey_task_invitations (task_id,invitation_id) SELECT id,invitation_id FROM journey_tasks WHERE invitation_id IS NOT NULL ON CONFLICT(task_id,invitation_id) DO NOTHING;
