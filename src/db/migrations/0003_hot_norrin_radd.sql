CREATE TABLE `analyst_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`result_id` text NOT NULL,
	`spec` text NOT NULL,
	`snapshot` text NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `analyst_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
