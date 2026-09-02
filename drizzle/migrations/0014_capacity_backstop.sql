-- A database backstop for occupancy: `schedules.booked_count` may not record
-- seats the class does not admit, and may not go negative.
--
-- Every capacity gate in the application is a read, and a read cannot refuse a
-- write a concurrent one has already made. `claimSeat` closed that for the
-- guarded paths by putting the check in the UPDATE's WHERE clause; this closes
-- it for the rest, including any future caller that forgets.
--
-- Existing rows are reconciled first, or this could not be applied to a
-- production database at all: paid bookings have oversold classes, deliberately
-- and by design.

-- Oversold classes keep their bookings and gain the capacity to match. The
-- other direction — clamping the count — would throw away the fact that those
-- people are coming, and leave occupancy disagreeing with the bookings table.
-- `forceClaimSeat` now does the same thing at the moment of the sale.
UPDATE "schedules" SET "capacity" = "booked_count" WHERE "booked_count" > "capacity";--> statement-breakpoint
-- Nothing should have produced one of these: every release is clamped at zero.
-- Reconciled anyway, because a row that predates the clamps would otherwise
-- make this migration unappliable.
UPDATE "schedules" SET "booked_count" = 0 WHERE "booked_count" < 0;--> statement-breakpoint
-- Idempotent so a re-run — a renumbered migration offered to a database that
-- already applied it — is a no-op rather than a dead deploy. A repeated CHECK
-- raises duplicate_object: unlike UNIQUE, it creates no index to clash with.
DO $$ BEGIN
 ALTER TABLE "schedules" ADD CONSTRAINT "schedules_booked_count_within_capacity" CHECK ("schedules"."booked_count" >= 0 AND "schedules"."booked_count" <= "schedules"."capacity");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
