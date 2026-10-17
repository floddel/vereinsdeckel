CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"icon" text DEFAULT 'other' NOT NULL,
	"price_cents" integer NOT NULL,
	"tally_group" text,
	"track_stock" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_price" CHECK ("article"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cash_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pot_id" text NOT NULL,
	"counted_cents" integer NOT NULL,
	"expected_cents" integer NOT NULL,
	"difference_cents" integer NOT NULL,
	"correction_movement_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_count_difference" CHECK ("cash_count"."difference_cents" = "cash_count"."counted_cents" - "cash_count"."expected_cents")
);
--> statement-breakpoint
CREATE TABLE "cash_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pot_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"transfer_group_id" uuid,
	"note" text NOT NULL,
	"reverses_movement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movement_amount" CHECK ("cash_movement"."amount_cents" <> 0),
	CONSTRAINT "cash_movement_note" CHECK (length(trim("cash_movement"."note")) > 0),
	CONSTRAINT "cash_movement_type" CHECK (type in ('deposit', 'handover', 'transfer', 'paypal_fee', 'other_expense', 'reimbursement', 'count_correction', 'reversal')),
	CONSTRAINT "cash_movement_reversal" CHECK (("cash_movement"."type" = 'reversal') = ("cash_movement"."reverses_movement_id" is not null)),
	CONSTRAINT "cash_movement_transfer" CHECK (("cash_movement"."type" = 'transfer') = ("cash_movement"."transfer_group_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_date" date NOT NULL,
	"title" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_businessDate_unique" UNIQUE("business_date")
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_count_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"counted_qty" integer NOT NULL,
	"expected_qty" integer NOT NULL,
	"difference_qty" integer NOT NULL,
	CONSTRAINT "inventory_line_difference" CHECK ("inventory_line"."difference_qty" = "inventory_line"."counted_qty" - "inventory_line"."expected_qty")
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"member_no" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "member_token_length" CHECK (length("member_token"."token") >= 32)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"method_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"cash_given_cents" integer,
	"reverses_payment_id" uuid,
	"reason" text,
	"sale_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text,
	CONSTRAINT "payment_sign" CHECK (case when "payment"."reverses_payment_id" is null
        then "payment"."amount_cents" >= 0 and "payment"."tip_cents" >= 0 and "payment"."amount_cents" + "payment"."tip_cents" > 0
        else "payment"."amount_cents" <= 0 and "payment"."tip_cents" <= 0 and "payment"."amount_cents" + "payment"."tip_cents" < 0
          and "payment"."reason" is not null and length(trim("payment"."reason")) > 0
      end)
);
--> statement-breakpoint
CREATE TABLE "payment_method" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"pot_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pot" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchased_on" date NOT NULL,
	"source" text NOT NULL,
	"receipt_file_id" uuid,
	"note" text,
	"reverses_purchase_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_source" CHECK ("purchase"."source" in ('cash', 'paypal', 'private')),
	CONSTRAINT "purchase_reversal_reason" CHECK ("purchase"."reverses_purchase_id" is null or ("purchase"."reason" is not null and length(trim("purchase"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "purchase_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"article_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"total_cents" integer NOT NULL,
	CONSTRAINT "purchase_line_quantity" CHECK ("purchase_line"."quantity" <> 0),
	CONSTRAINT "purchase_line_sign" CHECK (("purchase_line"."quantity" > 0 and "purchase_line"."total_cents" >= 0) or ("purchase_line"."quantity" < 0 and "purchase_line"."total_cents" <= 0))
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reverses_sale_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text,
	CONSTRAINT "sale_kind" CHECK ("sale"."kind" in ('sale', 'reversal')),
	CONSTRAINT "sale_reversal_reason" CHECK ("sale"."kind" = 'sale' or ("sale"."reason" is not null and length(trim("sale"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "sale_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"article_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"reverses_line_id" uuid,
	CONSTRAINT "sale_line_quantity" CHECK ("sale_line"."quantity" <> 0),
	CONSTRAINT "sale_line_price" CHECK ("sale_line"."unit_price_cents" >= 0),
	CONSTRAINT "sale_line_total" CHECK ("sale_line"."total_cents" = "sale_line"."quantity" * "sale_line"."unit_price_cents"),
	CONSTRAINT "sale_line_reversal_sign" CHECK (("sale_line"."quantity" > 0) = ("sale_line"."reverses_line_id" is null))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"club_name" text DEFAULT 'Angelverein' NOT NULL,
	"logo_file_id" uuid,
	"paypal_name" text,
	"warn_limit_cents" integer DEFAULT 3000 NOT NULL,
	"pin_hash" text,
	"business_day_cutoff_hour" integer DEFAULT 6 NOT NULL,
	"low_stock_evenings" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_warn_limit" CHECK ("settings"."warn_limit_cents" >= 0),
	CONSTRAINT "settings_cutoff" CHECK ("settings"."business_day_cutoff_hour" between 0 and 12)
);
--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_correction_movement_id_cash_movement_id_fk" FOREIGN KEY ("correction_movement_id") REFERENCES "public"."cash_movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_reverses_movement_id_cash_movement_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."cash_movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_line" ADD CONSTRAINT "inventory_line_inventory_count_id_inventory_count_id_fk" FOREIGN KEY ("inventory_count_id") REFERENCES "public"."inventory_count"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_line" ADD CONSTRAINT "inventory_line_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_token" ADD CONSTRAINT "member_token_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_method_id_payment_method_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."payment_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_reverses_payment_id_payment_id_fk" FOREIGN KEY ("reverses_payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_receipt_file_id_file_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_reverses_purchase_id_purchase_id_fk" FOREIGN KEY ("reverses_purchase_id") REFERENCES "public"."purchase"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_purchase_id_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchase"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_reverses_sale_id_sale_id_fk" FOREIGN KEY ("reverses_sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_reverses_line_id_sale_line_id_fk" FOREIGN KEY ("reverses_line_id") REFERENCES "public"."sale_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_logo_file_id_file_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_line_unique" ON "inventory_line" USING btree ("inventory_count_id","article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_member_no_unique" ON "member" USING btree ("member_no");--> statement-breakpoint
CREATE UNIQUE INDEX "member_token_token_unique" ON "member_token" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "member_token_one_active" ON "member_token" USING btree ("member_id") WHERE "member_token"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "payment_member_idx" ON "payment" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_event_idx" ON "payment" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sale_member_idx" ON "sale" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "sale_event_idx" ON "sale" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sale_line_sale_idx" ON "sale_line" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_line_reverses_idx" ON "sale_line" USING btree ("reverses_line_id");