import { and, eq, gte, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bundleConfig, classes, schedules } from "@/lib/db/schema";
import { BookingClient } from "./booking-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a Class — Moontide" };

export default async function BookPage() {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(
      and(
        gte(schedules.date, today),
        // Closed classes are still listed: they take no bookings, and the page
        // offers the waiting list for them exactly as it does for a full one.
        // Only a cancelled class disappears.
        inArray(schedules.status, ["open", "closed"]),
      ),
    )
    .orderBy(schedules.date, schedules.startTime);

  const activeBundles = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  const activeBundleConfig = activeBundles[0] ?? null;

  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue text-center mb-3">
          Book a Class
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />
        <BookingClient schedules={upcoming} bundleConfig={activeBundleConfig} />
      </div>
    </section>
  );
}
