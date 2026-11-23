CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text,
	`encrypted_api_key` text,
	`default_model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analyst_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`usage` text,
	FOREIGN KEY (`thread_id`) REFERENCES `analyst_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `analyst_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`database_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`database_id`) REFERENCES `database_connections`(`id`) ON UPDATE no action ON DELETE set null
);
