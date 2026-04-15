import { and, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bookings,
  bundleConfig,
  bundles,
  classes,
  schedules,
} from "@/lib/db/schema";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
} from "@/lib/email";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  let succeededBookings = 0;
  let succeededBundles = 0;
  let failed = 0;

  // Retry unsent booking emails
  const pendingBookings = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(and(eq(bookings.emailSent, false), gte(bookings.createdAt, cutoff)));

  for (const row of pendingBookings) {
    try {
      await sendBookingConfirmation({
        customerName: row.bookings.customerName,
        customerEmail: row.bookings.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        location: row.schedules.location,
        priceInPence: row.classes.priceInPence,
      });

      await sendBookingNotification({
        type: "individual",
        customerName: row.bookings.customerName,
        customerEmail: row.bookings.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        location: row.schedules.location,
      });

      await db
        .update(bookings)
        .set({ emailSent: true })
        .where(eq(bookings.id, row.bookings.id));

      succeededBookings++;
    } catch (error) {
      console.error(
        `Failed to retry booking email for booking ${row.bookings.id}:`,
        error,
      );
      failed++;
    }
  }

  // Retry unsent bundle emails
  const pendingBundles = await db
    .select()
    .from(bundles)
    .innerJoin(bundleConfig, eq(bundles.creditsTotal, bundleConfig.credits))
    .where(and(eq(bundles.emailSent, false), gte(bundles.purchasedAt, cutoff)));

  for (const row of pendingBundles) {
    try {
      const expiryDate = new Date(row.bundles.expiresAt).toLocaleDateString(
        "en-GB",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      );

      await sendBundleConfirmation({
        customerEmail: row.bundles.customerEmail,
        bundleName: row.bundle_config.name,
        credits: row.bundle_config.credits,
        expiryDate,
      });

      await sendBookingNotification({
        type: "bundle",
        customerEmail: row.bundles.customerEmail,
        bundleName: row.bundle_config.name,
        credits: row.bundle_config.credits,
        expiryDate,
      });

      await db
        .update(bundles)
        .set({ emailSent: true })
        .where(eq(bundles.id, row.bundles.id));

      succeededBundles++;
    } catch (error) {
      console.error(
        `Failed to retry bundle email for bundle ${row.bundles.id}:`,
        error,
      );
      failed++;
    }
  }

  return NextResponse.json({
    retriedBookings: pendingBookings.length,
    retriedBundles: pendingBundles.length,
    succeeded: succeededBookings + succeededBundles,
    failed,
  });
}
