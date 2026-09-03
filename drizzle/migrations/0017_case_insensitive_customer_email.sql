-- Capitalisation is not a customer.
--
-- Both uniqueness indexes matched `customer_email` raw, so `Ada@example.com`
-- and `ada@example.com` were two people to Postgres: the same person could be
-- charged twice for one class, and the duplicate-booking index added in #27/#28
-- was defeated by the shift key. The handlers now normalise every address they
-- write through `src/lib/customers/email.ts`; these indexes are what holds when
-- one of them forgets, and what makes the rows written before it consistent.
--
-- Written to survive a re-run: drizzle selects work by journal timestamp, so a
-- migration renumbered in a merge can be offered to a database that has already
-- applied it.

-- Rows that already exist are reconciled first, or the stricter index could not
-- be created on a production database at all — the very duplicates it exists to
-- prevent are the ones that would refuse it.
--
-- Bookings: the earliest active booking of each case-variant set keeps its
-- place; the later ones are cancelled and their seats returned, because they
-- are one person taking one seat and the second seat was never real. Stripe
-- stays the record of any money taken, and a second payment is a refund only a
-- human can decide on. They are findable afterwards as a cancelled booking
-- sharing a class and a lower(email) with an active one:
--
--   SELECT b.* FROM bookings b WHERE b.status = 'cancelled' AND EXISTS (
--     SELECT 1 FROM bookings o WHERE o.schedule_id = b.schedule_id
--       AND lower(o.customer_email) = lower(b.customer_email)
--       AND o.status <> 'cancelled');
--
-- A seat is only given back for a booking that was holding one: a `released`
-- booking handed its seat back when it was released, and decrementing again
-- would lose a seat the class actually has. Re-running matches nothing — by
-- then there are no case-variant duplicates left.
WITH duplicates AS (
  SELECT b."id", b."schedule_id", b."status"
  FROM "bookings" b
  WHERE b."status" <> 'cancelled'
    AND EXISTS (
      SELECT 1 FROM "bookings" o
      WHERE o."schedule_id" = b."schedule_id"
        AND lower(o."customer_email") = lower(b."customer_email")
        AND o."status" <> 'cancelled'
        AND o."id" < b."id"
    )
), cancelled AS (
  UPDATE "bookings"
  SET "status" = 'cancelled'
  WHERE "id" IN (SELECT "id" FROM duplicates)
  RETURNING "id", "schedule_id", "status"
), seats_freed AS (
  SELECT "schedule_id", count(*)::int AS "seats"
  FROM duplicates
  WHERE "status" IN ('confirmed', 'held')
  GROUP BY "schedule_id"
)
UPDATE "schedules" s
SET "booked_count" = GREATEST(0, s."booked_count" - f."seats")
FROM seats_freed f
WHERE s."id" = f."schedule_id";--> statement-breakpoint
-- Waiting list: nobody has paid for a place, so a case-variant duplicate is
-- simply the same person listed twice and the redundant rows go. The one kept
-- is whichever holds an outstanding offer — deleting that would orphan the held
-- booking it names — and otherwise the earliest, which is their real place in
-- the queue.
DELETE FROM "waitlist_entries"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "schedule_id", lower("customer_email")
      ORDER BY ("held_booking_id" IS NULL), "id"
    ) AS "place"
    FROM "waitlist_entries"
  ) ranked
  WHERE ranked."place" > 1
);--> statement-breakpoint
-- Dropped and recreated under the same names, so nothing else has to learn a
-- new one. `IF EXISTS`/`IF NOT EXISTS` rather than the recipe for constraints:
-- these are indexes, and a re-run drops the case-insensitive one and builds it
-- again inside the migration's own transaction.
DROP INDEX IF EXISTS "bookings_schedule_email_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "waitlist_schedule_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_schedule_email_active_idx" ON "bookings" USING btree ("schedule_id",lower("customer_email")) WHERE "bookings"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_schedule_email_idx" ON "waitlist_entries" USING btree ("schedule_id",lower("customer_email"));
