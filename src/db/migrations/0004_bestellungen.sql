CREATE TABLE "food_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"reject_reason" text,
	"sale_id" uuid,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_order_status" CHECK (status in ('new', 'accepted', 'ready', 'picked_up', 'rejected', 'cancelled')),
	CONSTRAINT "food_order_note" CHECK ("food_order"."note" is null or length("food_order"."note") <= 200),
	CONSTRAINT "food_order_picked_up" CHECK (("food_order"."status" = 'picked_up') = ("food_order"."sale_id" is not null)),
	CONSTRAINT "food_order_rejected" CHECK ("food_order"."status" <> 'rejected' or ("food_order"."reject_reason" is not null and length(trim("food_order"."reject_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "food_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_order_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "food_order_line_quantity" CHECK ("food_order_line"."quantity" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "orderable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "kitchen_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "food_order" ADD CONSTRAINT "food_order_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_order" ADD CONSTRAINT "food_order_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_order" ADD CONSTRAINT "food_order_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_order_line" ADD CONSTRAINT "food_order_line_food_order_id_food_order_id_fk" FOREIGN KEY ("food_order_id") REFERENCES "public"."food_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_order_line" ADD CONSTRAINT "food_order_line_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "food_order_sale_unique" ON "food_order" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "food_order_event_idx" ON "food_order" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "food_order_member_idx" ON "food_order" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "food_order_line_unique" ON "food_order_line" USING btree ("food_order_id","article_id");