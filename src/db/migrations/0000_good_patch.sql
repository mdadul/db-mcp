CREATE TABLE `database_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`database_name` text NOT NULL,
	`username` text NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`ssl` integer DEFAULT false NOT NULL,
	`service_name` text,
	`environment` text,
	`status` text DEFAULT 'enabled' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `query_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`database_connection_id` text NOT NULL,
	`tool_name` text,
	`query_hash` text,
	`query` text NOT NULL,
	`execution_time_ms` integer,
	`row_count` integer,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`database_connection_id`) REFERENCES `database_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`tool` text NOT NULL,
	`database_connection_id` text,
	`status` text DEFAULT 'success' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
