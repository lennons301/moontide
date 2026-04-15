ALTER TABLE "bookings" ADD COLUMN "email_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bundles" ADD COLUMN "email_sent" boolean DEFAULT false NOT NULL;