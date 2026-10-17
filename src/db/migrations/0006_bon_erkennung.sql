CREATE TABLE "purchase_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"article_id" uuid NOT NULL,
	"units_per_item" integer,
	"bottle_ml" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_alias_units" CHECK ("purchase_alias"."units_per_item" is null or "purchase_alias"."units_per_item" between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ai_receipts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "anthropic_key_enc" text;--> statement-breakpoint
ALTER TABLE "purchase_alias" ADD CONSTRAINT "purchase_alias_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_alias_text_unique" ON "purchase_alias" USING btree ("text");