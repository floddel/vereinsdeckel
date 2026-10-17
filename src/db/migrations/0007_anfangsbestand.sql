ALTER TABLE "purchase" DROP CONSTRAINT "purchase_source";--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "stock_article_id" uuid;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_stock_article_id_article_id_fk" FOREIGN KEY ("stock_article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_stock_other" CHECK ("article"."stock_article_id" is null or "article"."stock_article_id" <> "article"."id");--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_source" CHECK ("purchase"."source" in ('cash', 'paypal', 'private', 'opening'));