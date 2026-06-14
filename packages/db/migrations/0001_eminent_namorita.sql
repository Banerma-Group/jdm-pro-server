ALTER TABLE "listings" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
WITH listing_slugs AS (
	SELECT
		"id",
		replace("id"::text, '-', '') AS suffix,
		nullif(
			regexp_replace(
				regexp_replace(lower(coalesce("maker", '') || '-' || coalesce("model", '')), '[^a-z0-9]+', '-', 'g'),
				'(^-+|-+$)',
				'',
				'g'
			),
			''
		) AS base
	FROM "listings"
)
UPDATE "listings"
SET "slug" = CASE
	WHEN listing_slugs.base IS NULL THEN listing_slugs.suffix
	ELSE left(listing_slugs.base, 222) || '-' || listing_slugs.suffix
END
FROM listing_slugs
WHERE "listings"."id" = listing_slugs."id"
	AND "listings"."slug" IS NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "set_listing_slug"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	base text;
	suffix text;
BEGIN
	IF NEW."slug" IS NOT NULL AND NEW."slug" <> '' THEN
		RETURN NEW;
	END IF;

	base := nullif(
		regexp_replace(
			regexp_replace(lower(coalesce(NEW."maker", '') || '-' || coalesce(NEW."model", '')), '[^a-z0-9]+', '-', 'g'),
			'(^-+|-+$)',
			'',
			'g'
		),
		''
	);
	suffix := replace(NEW."id"::text, '-', '');
	NEW."slug" := CASE
		WHEN base IS NULL THEN suffix
		ELSE left(base, 222) || '-' || suffix
	END;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "listings_set_slug_trg"
BEFORE INSERT ON "listings"
FOR EACH ROW
EXECUTE FUNCTION "set_listing_slug"();--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_slug_uq" ON "listings" USING btree ("slug");
