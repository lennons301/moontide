-- Database backstops for invariants the application only asserted in advisory
-- reads. Every statement is written to survive a re-run: drizzle selects work
-- by journal timestamp, so a migration that is renumbered in a merge can be
-- offered to a database that has already applied it.

-- 1. Which bundle product was bought.
--
-- Nullable, because the link cannot always be recovered: bundles bought before
-- this column existed record only their credit count, and that is ambiguous
-- the moment two configs sell the same number of credits.
ALTER TABLE "bundles" ADD COLUMN IF NOT EXISTS "bundle_config_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bundles" ADD CONSTRAINT "bundles_bundle_config_id_bundle_config_id_fk" FOREIGN KEY ("bundle_config_id") REFERENCES "public"."bundle_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- Backfilled only where the credit count names exactly one config. Where two
-- configs share a credit count the answer is genuinely unknown, and a guess
-- would be indistinguishable from a fact once it is written down.
UPDATE "bundles" b
SET "bundle_config_id" = (
  SELECT c."id" FROM "bundle_config" c WHERE c."credits" = b."credits_total"
)
WHERE b."bundle_config_id" IS NULL
  AND (
    SELECT count(*) FROM "bundle_config" c WHERE c."credits" = b."credits_total"
  ) = 1;--> statement-breakpoint

-- 2. One bundle per Stripe payment.
--
-- The bundle branch of the webhook has no idempotency guard, so a redelivered
-- checkout.session.completed granted a second bundle of free credits. Existing
-- duplicates are reconciled first, or the constraint could not be added to a
-- production database at all.
--
-- The earliest row of each set keeps the payment id; the later ones are marked
-- rather than deleted. They are payment records, and credits may already have
-- been spent against them by bookings that point at them. Marking makes them
-- findable (`WHERE stripe_payment_id LIKE '%#duplicate-%'`) and leaves the
-- decision about the money to a human.
UPDATE "bundles" b
SET "stripe_payment_id" = b."stripe_payment_id" || '#duplicate-' || b."id"
WHERE EXISTS (
  SELECT 1 FROM "bundles" o
  WHERE o."stripe_payment_id" = b."stripe_payment_id" AND o."id" < b."id"
);--> statement-breakpoint
-- A repeated UNIQUE constraint raises duplicate_table, not duplicate_object:
-- the clash is with the index it creates, not the constraint.
DO $$ BEGIN
 ALTER TABLE "bundles" ADD CONSTRAINT "bundles_stripe_payment_id_unique" UNIQUE("stripe_payment_id");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
