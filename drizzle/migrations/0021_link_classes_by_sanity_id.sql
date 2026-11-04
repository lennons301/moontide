-- Join a class to its Sanity content by `_id`, not by slug (#131, #134).
--
-- Both classes.slug and the Sanity service document's own slug are editable,
-- independently, so they drift: the Postgres row for "Autumn Equinox Yin" was
-- renamed vinyasa -> yincircle in the admin while the same Sanity document
-- was re-slugged to "yin" in Studio. classes.sanityId has existed since the
-- start but nothing ever wrote it; from here the join is by `_id`, which
-- neither side's rename can orphan.
--
-- Written to survive a re-run: every statement below is a no-op once applied,
-- per AGENTS.md "Migrations must be re-runnable".

-- The three classes whose slug has never changed.
UPDATE "classes" SET "sanity_id" = 'service-prenatal' WHERE "slug" = 'prenatal' AND "sanity_id" IS NULL;--> statement-breakpoint
UPDATE "classes" SET "sanity_id" = 'service-postnatal' WHERE "slug" = 'postnatal' AND "sanity_id" IS NULL;--> statement-breakpoint
UPDATE "classes" SET "sanity_id" = 'service-baby-yoga' WHERE "slug" = 'baby-yoga' AND "sanity_id" IS NULL;--> statement-breakpoint

-- The fourth: renamed vinyasa -> yincircle in the admin on production, but
-- still "vinyasa" wherever that rename has not happened (dev, a fresh seed).
-- Matched by rename history rather than a hardcoded current slug, so either
-- shape of database is found.
UPDATE "classes"
SET "sanity_id" = 'service-vinyasa'
WHERE "sanity_id" IS NULL
  AND (
    "slug" = 'vinyasa'
    OR "id" IN (SELECT "class_id" FROM "class_slug_redirects" WHERE "slug" = 'vinyasa')
  );--> statement-breakpoint

-- The homepage used to link that class's tile from Sanity's own slug
-- ("yin"), which nothing in Postgres ever knew about. Anyone who followed
-- that old link now 308s to the real page, the same as any other stale
-- slug — unless "yin" is already a live class's own slug, which it never
-- should be but is not this migration's place to override.
INSERT INTO "class_slug_redirects" ("slug", "class_id")
SELECT 'yin', "id" FROM "classes"
WHERE "sanity_id" = 'service-vinyasa'
  AND NOT EXISTS (SELECT 1 FROM "classes" WHERE "slug" = 'yin')
ON CONFLICT ("slug") DO NOTHING;
