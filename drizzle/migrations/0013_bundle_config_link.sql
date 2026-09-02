ALTER TABLE "bundles" ADD COLUMN IF NOT EXISTS "bundle_config_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bundles" ADD CONSTRAINT "bundles_bundle_config_id_bundle_config_id_fk" FOREIGN KEY ("bundle_config_id") REFERENCES "public"."bundle_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
-- Bundles bought before this column have no record of which product they were.
-- The best guess available is the one the code was already making: the config
-- whose credit count matches what was sold. It is made once, here, so that no
-- read path has to keep making it — after this, the link is exact for every
-- new purchase. Ties are broken towards the active config, then the oldest, so
-- a replay picks the same row.
UPDATE "bundles" SET "bundle_config_id" = (
  SELECT "bc"."id" FROM "bundle_config" AS "bc"
  WHERE "bc"."credits" = "bundles"."credits_total"
  ORDER BY "bc"."active" DESC, "bc"."id" ASC
  LIMIT 1
) WHERE "bundle_config_id" IS NULL;
