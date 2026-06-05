ALTER TABLE "bookings" ADD COLUMN "original_schedule_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_original_schedule_id_schedules_id_fk" FOREIGN KEY ("original_schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;