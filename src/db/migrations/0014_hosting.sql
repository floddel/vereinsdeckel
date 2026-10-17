ALTER TABLE "settings" ADD COLUMN "hosting_kind" text DEFAULT 'vercel-neon' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hosting_name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hosting_location" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hosting_contract" text;