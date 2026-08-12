-- Idempotent: this migration was applied to the shared stg database under its
-- original number (0008) before the master merge renumbered it to 0009 with a
-- fresh journal timestamp. Drizzle picks migrations by timestamp, not hash, so
-- the re-stamped entry re-runs on any database that already has the column.
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "bundle_eligible" boolean DEFAULT true NOT NULL;