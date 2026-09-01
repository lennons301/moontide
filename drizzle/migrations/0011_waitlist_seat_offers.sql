-- Idempotent so a preview deploy that already ran this against the shared stg
-- database does not fail a later re-run.
ALTER TYPE "public"."booking_status" ADD VALUE IF NOT EXISTS 'held';--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "offered_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "offer_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "offer_token" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "held_booking_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_held_booking_id_bookings_id_fk" FOREIGN KEY ("held_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- A repeated UNIQUE constraint raises duplicate_table, not duplicate_object:
-- the clash is with the index it creates, not the constraint.
DO $$ BEGIN
 ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_offer_token_unique" UNIQUE("offer_token");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
