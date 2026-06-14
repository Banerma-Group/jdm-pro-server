CREATE TYPE "public"."enum_users_role" AS ENUM('client', 'admin');--> statement-breakpoint
CREATE TYPE "public"."enum_vehicles_locale" AS ENUM('en', 'ja');--> statement-breakpoint
CREATE TYPE "public"."enum_vehicles_status" AS ENUM('available', 'sold', 'soon', 'ask');--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" uuid,
	"site" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"found_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "filter_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sites" jsonb DEFAULT '["goonet","carsensor"]'::jsonb NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"telegram_chat_id" text,
	"auto_create_vehicles" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_listing_id" text NOT NULL,
	"url" text NOT NULL,
	"maker" text,
	"model" text,
	"grade" text,
	"model_year" integer,
	"mileage_km" integer,
	"displacement_cc" integer,
	"transmission" text,
	"fuel_type" text,
	"body_type" text,
	"drivetrain" text,
	"color" text,
	"doors" integer,
	"seats" integer,
	"inspection_until" text,
	"repair_history" boolean,
	"total_price" bigint,
	"vehicle_price" bigint,
	"prefecture" text,
	"dealer_name" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"description_original" text,
	"description_translated" text,
	"raw" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"consecutive_misses" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "makers" (
	"value" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sites" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"name" varchar(255),
	"user_id" integer,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"preset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_processes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255),
	"slug" varchar(255),
	"description" jsonb,
	"introduction" varchar(255),
	"locale" varchar(255),
	"created_by_id" integer,
	"updated_by_id" integer,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255),
	"description" jsonb,
	"icon" varchar(255),
	"slug" varchar(255),
	"locale" varchar(255),
	"created_by_id" integer,
	"updated_by_id" integer,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" text NOT NULL,
	"telegram_user_id" text,
	"first_name" text,
	"last_name" text,
	"username" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "translation_cache" (
	"field" text NOT NULL,
	"source_text" text NOT NULL,
	"english" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_cache_field_source_text_pk" PRIMARY KEY("field","source_text")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"salt" varchar(500),
	"hash" varchar(1200),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"email" varchar(255) NOT NULL,
	"role" "enum_users_role",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicle_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"media_id" integer NOT NULL,
	"sort_order" integer,
	"is_cover" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"make" varchar(255),
	"model" varchar(255),
	"mileage" varchar(255),
	"color" varchar(255),
	"slug" varchar(255),
	"stock_number" integer,
	"status" "enum_vehicles_status",
	"vin" varchar(255),
	"transmission" varchar(255),
	"youtube_link" varchar(255),
	"description" text,
	"price" varchar(255),
	"is_posted" boolean,
	"year" integer,
	"locale" "enum_vehicles_locale",
	"youtube_cover_id" integer,
	"created_by_id" integer,
	"updated_by_id" integer,
	"crawler_listing_id" uuid,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_preset_id_filter_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."filter_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_preset_id_filter_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."filter_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_processes" ADD CONSTRAINT "purchasing_processes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_processes" ADD CONSTRAINT "purchasing_processes_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_youtube_cover_id_media_id_fk" FOREIGN KEY ("youtube_cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_crawler_listing_id_listings_id_fk" FOREIGN KEY ("crawler_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_id_uq" ON "listings" USING btree ("source","source_listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_listing_preset_uq" ON "notifications" USING btree ("listing_id","preset_id") WHERE preset_id is not null;--> statement-breakpoint
CREATE INDEX "price_history_listing_idx" ON "price_history" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "pp_created_by_id_fk" ON "purchasing_processes" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "pp_updated_by_id_fk" ON "purchasing_processes" USING btree ("updated_by_id");--> statement-breakpoint
CREATE INDEX "services_documents_idx" ON "services" USING btree ("locale","published_at");--> statement-breakpoint
CREATE INDEX "services_created_by_id_fk" ON "services" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "services_updated_by_id_fk" ON "services" USING btree ("updated_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_connections_chat_id_uq" ON "telegram_connections" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_media_vehicle_id_media_id_key" ON "vehicle_media" USING btree ("vehicle_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_crawler_listing_id_uq" ON "vehicles" USING btree ("crawler_listing_id");--> statement-breakpoint
CREATE INDEX "vehicles_created_by_id_fk" ON "vehicles" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "vehicles_updated_by_id_fk" ON "vehicles" USING btree ("updated_by_id");