ALTER TABLE `database_connections` ADD `folder` text;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `description` text;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `favourite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `last_tested_at` integer;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `last_test_status` text;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `last_test_message` text;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `last_test_latency_ms` integer;--> statement-breakpoint
ALTER TABLE `database_connections` ADD `server_version` text;