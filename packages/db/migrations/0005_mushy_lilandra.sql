CREATE TABLE "markets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "market_id" integer;--> statement-breakpoint
CREATE INDEX "markets_sort_order_idx" ON "markets" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "markets_slug_uq" ON "markets" USING btree ("slug");--> statement-breakpoint
INSERT INTO "markets" ("name", "slug", "sort_order", "created_at", "updated_at") VALUES
	('JDM', 'jdm', 0, NOW(), NOW()),
	('European', 'european', 1, NOW(), NOW());--> statement-breakpoint
UPDATE "vehicles"
SET "market_id" = "markets"."id"
FROM "markets"
WHERE "vehicles"."market" IS NOT NULL
	AND "markets"."slug" = lower(regexp_replace(trim("vehicles"."market"), '[^a-zA-Z0-9]+', '-', 'g'));--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicles_market_id_fk" ON "vehicles" USING btree ("market_id");--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN "market";
