-- Lets a class's slug be renamed without 404ing whoever still has the old
-- link, and stops a rename from rewriting what a past booking shows.
--
-- `class_slug_redirects` records every slug a class has held other than its
-- current one — written by the admin editor whenever it changes `classes.slug`
-- — so `/classes/[slug]` can 308 a stale request on to the class's *current*
-- slug in one hop, however many renames sit between the two.
--
-- `bookings.class_title` snapshots the class's title at booking time, so a
-- later rename of that class's title (or slug) never changes what a
-- confirmation email or an admin table shows for a booking already made.
-- Backfilled from the class each existing booking is on before the column is
-- made NOT NULL — there is no default a fresh booking could use instead.
CREATE TABLE IF NOT EXISTS "class_slug_redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"class_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_slug_redirects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "class_slug_redirects" ADD CONSTRAINT "class_slug_redirects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "class_title" text;
--> statement-breakpoint
UPDATE "bookings" AS b
SET "class_title" = c."title"
FROM "schedules" AS s
JOIN "classes" AS c ON c."id" = s."class_id"
WHERE b."schedule_id" = s."id" AND b."class_title" IS NULL;
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "class_title" SET NOT NULL;
