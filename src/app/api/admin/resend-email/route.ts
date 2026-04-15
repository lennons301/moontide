import { eq } from "drizzle-orm";
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
  const { type, id } = await request.json();

  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }

  if (type === "booking") {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
      .innerJoin(classes, eq(schedules.classId, classes.id))
      .where(eq(bookings.id, id));

    if (result.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const row = result[0];

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
      .where(eq(bookings.id, id));

    return NextResponse.json({ success: true });
  }

  if (type === "bundle") {
    const result = await db
      .select()
      .from(bundles)
      .innerJoin(bundleConfig, eq(bundles.creditsTotal, bundleConfig.credits))
      .where(eq(bundles.id, id));

    if (result.length === 0) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    const row = result[0];
    const expiryDate = new Date(row.bundles.expiresAt).toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short", year: "numeric" },
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

    await db.update(bundles).set({ emailSent: true }).where(eq(bundles.id, id));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
