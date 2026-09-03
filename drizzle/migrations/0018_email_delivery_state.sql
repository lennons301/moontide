-- Delivery state for every notification that has a recipient.
--
-- `email_sent` was the whole of it: set true once, never counted, never dated
-- and never explained, so a confirmation that failed looked exactly like one
-- nobody had attempted, and nothing recorded why it failed.
--
-- `email_kind` says which notification a booking still owes while `email_sent`
-- is false. Every existing row owes a confirmation, which is the default, so
-- there is nothing to back-fill: a booking rescheduled before this migration
-- has `email_sent` true and owes nothing.
--
-- `email_sent_at` is left null on rows already marked sent, deliberately: we do
-- not know when they went out, and back-filling `created_at` would invent a
-- delivery time. Null there means "sent before this column existed".
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "email_kind" text DEFAULT 'confirmation' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "email_last_error" text;--> statement-breakpoint
ALTER TABLE "bundles" ADD COLUMN IF NOT EXISTS "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bundles" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "bundles" ADD COLUMN IF NOT EXISTS "email_last_error" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "email_last_error" text;
