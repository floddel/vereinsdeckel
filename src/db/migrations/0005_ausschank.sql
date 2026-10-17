ALTER TABLE "purchase_line" ALTER COLUMN "total_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "serving_ml" integer;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "bottle_ml" integer;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "pack_size" integer;--> statement-breakpoint
ALTER TABLE "inventory_line" ADD COLUMN "in_ml" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_line" ADD COLUMN "bottle_ml" integer;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_serving" CHECK ("article"."serving_ml" is null or "article"."serving_ml" between 1 and 5000);--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_bottle" CHECK ("article"."bottle_ml" is null or "article"."bottle_ml" between 1 and 50000);--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_pack" CHECK ("article"."pack_size" is null or "article"."pack_size" between 2 and 1000);--> statement-breakpoint
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_bottle" CHECK ("purchase_line"."bottle_ml" is null or "purchase_line"."bottle_ml" between 1 and 50000);