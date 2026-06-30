UPDATE "vehicles"
SET "market_id" = (SELECT "id" FROM "markets" WHERE "slug" = 'jdm' LIMIT 1)
WHERE "market_id" IS NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "market_id" SET DEFAULT 1;
