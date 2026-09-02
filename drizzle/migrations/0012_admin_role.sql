ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- Every account that predates this migration is an admin login: this system
-- has no customer accounts, only Gabrielle's. Without the backfill the column
-- defaults her to 'user' and the proxy locks her out of her own admin.
-- Bounded by date so a replay of this migration cannot promote anyone created
-- afterwards.
UPDATE "user" SET "role" = 'admin' WHERE "created_at" < '2026-09-01T00:00:00Z';
