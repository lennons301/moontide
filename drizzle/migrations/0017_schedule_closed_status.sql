-- Fullness is derived, not declared (#87). So `schedule_status` loses `full`
-- and gains `closed`.
--
-- `full` was a flag only two of the nine places that asked "is this class
-- full?" honoured: `claimSeat` ignored it, so a class Gabrielle had marked full
-- by hand still took bundle redemptions and was still offered as a reschedule
-- destination. Fullness is now computed from `capacity` and `booked_count`
-- wherever it is needed, and cannot go stale because nothing stores it.
-- `closed` is what she actually wanted the flag for — a class that takes no
-- more bookings — and every seat claim respects it.
--
-- Every class flagged `full` becomes `closed`: that is what she meant by it,
-- and the two are indistinguishable to anyone who has to be turned away.
--
-- Written to survive a re-run. Drizzle selects work by journal timestamp, so a
-- migration renumbered while resolving a merge can be offered to a database
-- that has already applied it — here the whole block is skipped once `full` is
-- no longer a member of the type.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'schedule_status'
      AND e.enumlabel = 'full'
  ) THEN
    RETURN;
  END IF;

  -- The type is replaced rather than edited: Postgres can add an enum value but
  -- not remove one. A wholly new type may be used in the transaction that
  -- created it (unlike a newly *added* value), so this stays one atomic step.
  ALTER TYPE "public"."schedule_status" RENAME TO "schedule_status_pre_0017";
  CREATE TYPE "public"."schedule_status" AS ENUM('open', 'closed', 'cancelled');

  -- The default is dropped and restored around the cast: it is typed by the old
  -- type and would otherwise block the column changing under it.
  ALTER TABLE "schedules" ALTER COLUMN "status" DROP DEFAULT;
  ALTER TABLE "schedules"
    ALTER COLUMN "status" SET DATA TYPE "public"."schedule_status"
    USING (
      CASE "status"::text WHEN 'full' THEN 'closed' ELSE "status"::text END
    )::"public"."schedule_status";
  ALTER TABLE "schedules"
    ALTER COLUMN "status" SET DEFAULT 'open'::"public"."schedule_status";

  DROP TYPE "public"."schedule_status_pre_0017";
END $$;
