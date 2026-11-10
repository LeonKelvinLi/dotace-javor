CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`item_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_org_idx` ON `audit` (`organization_id`);--> statement-breakpoint
CREATE INDEX `audit_contract_idx` ON `audit` (`contract_id`);--> statement-breakpoint
CREATE TABLE `bootstrap` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`seeded` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contract_org_idx` ON `contracts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_org_idx` ON `feedback` (`organization_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`object_key` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `file_contract_idx` ON `files` (`contract_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` text,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`version` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`claimed_cents` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_contract_idx` ON `items` (`contract_id`);--> statement-breakpoint
CREATE INDEX `item_org_idx` ON `items` (`organization_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`email` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_unique` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `membership_org_idx` ON `memberships` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER audit_immutable_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
