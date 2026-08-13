-- Idempotent so a preview deploy that already ran this against the shared stg
-- database does not fail a later re-run.
ALTER TYPE "public"."booking_status" ADD VALUE IF NOT EXISTS 'released';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "released_at" timestamp;
