-- A database backstop for bundle credits: `bundles.credits_remaining` may not
-- promise more classes than the bundle was sold with, and may not go negative.
--
-- The debit used to compute the new balance in JavaScript, from a row read
-- before its transaction opened, and write it as an absolute value: two
-- redemptions of one remaining credit both read 1, both wrote 0, and two
-- classes were booked for one credit. `spendCredit` closed that by putting the
-- guard in the UPDATE's WHERE clause; this closes it for any future caller that
-- writes the column itself.
--
-- Existing rows are reconciled first, or this could not be applied to a
-- production database at all — the lost update it exists to prevent may already
-- have left one behind.

-- Nothing should have produced one of these, but the debit that could was
-- unguarded. Zero rather than a guess at how many redemptions got through: the
-- bookings are the record of what was spent, and inventing credits here would
-- hand out classes nobody paid for. The status follows, because a bundle with
-- nothing left is `exhausted` everywhere else.
UPDATE "bundles" SET "credits_remaining" = 0, "status" = 'exhausted' WHERE "credits_remaining" < 0;--> statement-breakpoint
-- More credits than were sold. `credits_total` is what the customer bought —
-- recorded from the bundle config at purchase — so the balance comes down to
-- it, which is exactly what the refund path's LEAST has always done.
UPDATE "bundles" SET "credits_remaining" = "credits_total" WHERE "credits_remaining" > "credits_total";--> statement-breakpoint
-- Idempotent so a re-run — a renumbered migration offered to a database that
-- already applied it — is a no-op rather than a dead deploy. A repeated CHECK
-- raises duplicate_object: unlike UNIQUE, it creates no index to clash with.
DO $$ BEGIN
 ALTER TABLE "bundles" ADD CONSTRAINT "bundles_credits_remaining_within_total" CHECK ("bundles"."credits_remaining" >= 0 AND "bundles"."credits_remaining" <= "bundles"."credits_total");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
