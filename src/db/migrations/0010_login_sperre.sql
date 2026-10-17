ALTER TABLE "settings" ADD COLUMN "login_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "login_locked_until" timestamp with time zone;