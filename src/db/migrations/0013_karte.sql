ALTER TABLE "article" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "daily_special" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "offered_on" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tip_article_id" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tip_text" text;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_tip_article_id_article_id_fk" FOREIGN KEY ("tip_article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;