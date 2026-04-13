CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."booking_type" AS ENUM('stripe', 'contact');--> statement-breakpoint
CREATE TYPE "public"."bundle_status" AS ENUM('active', 'expired', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."class_category" AS ENUM('class', 'coaching', 'community');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('open', 'full', 'cancelled');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"stripe_payment_id" text,
	"bundle_id" integer,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_email" text NOT NULL,
	"credits_total" integer DEFAULT 6 NOT NULL,
	"credits_remaining" integer DEFAULT 6 NOT NULL,
	"stripe_payment_id" text NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" "bundle_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"sanity_id" text,
	"category" "class_category" NOT NULL,
	"booking_type" "booking_type" DEFAULT 'stripe' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"price_in_pence" integer NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "classes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"capacity" integer DEFAULT 8 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"location" text,
	"recurring_rule" text,
	"status" "schedule_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;