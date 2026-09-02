-- One bundle per Stripe payment.
--
-- The bundle branch of the webhook had no idempotency guard, so a redelivered
-- checkout.session.completed granted a second bundle of free credits. The
-- guard is in the handler now; this is the part that holds when two deliveries
-- arrive at once, which no read-then-write in the application can.
--
-- Written to survive a re-run: drizzle selects work by journal timestamp, so a
-- migration renumbered in a merge can be offered to a database that has
-- already applied it.

-- Existing duplicates are reconciled first, or the constraint could not be
-- added to a production database at all.
--
-- The earliest row of each set keeps the payment id; the later ones are marked
-- rather than deleted. They are payment records, and credits may already have
-- been spent against them by bookings that point at them. Marking makes them
-- findable (`WHERE stripe_payment_id LIKE '%#duplicate-%'`) and leaves the
-- decision about the money to a human. Re-running matches nothing: by then
-- there are no duplicates left to mark.
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
