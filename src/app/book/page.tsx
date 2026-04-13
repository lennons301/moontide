import { and, eq, gte } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { classes, schedules } from "@/lib/db/schema";
import { BookingClient } from "./booking-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a Class — Moontide" };

export default async function BookPage() {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(and(gte(schedules.date, today), eq(schedules.status, "open")));

  return (
    <section className="py-16 px-6 bg-foam-white">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-current text-center mb-3">
          Book a Class
        </h1>
        <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-8" />
        <BookingClient schedules={upcoming} />
      </div>
    </section>
  );
}
