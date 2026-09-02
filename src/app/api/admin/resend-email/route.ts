import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
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
import { ApiError, withAdmin } from "../_lib";

const missingId = { error: "Missing id" };

const resendBody = z.object({
  type: z.enum(["booking", "bundle"], { error: "Invalid type" }),
  id: z.number(missingId).int(missingId).positive(missingId),
});

export const POST = withAdmin({ body: resendBody }, async ({ body }) => {
  const { type, id } = body;

  if (type === "booking") {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
      .innerJoin(classes, eq(schedules.classId, classes.id))
      .where(eq(bookings.id, id));

    if (result.length === 0) {
      throw new ApiError(404, "Booking not found");
    }

    const row = result[0];

    // A held seat is an offer nobody has taken up: there is no booking to
    // confirm, and a confirmation would tell them they are coming.
    if (row.bookings.status === "held") {
      throw new ApiError(400, "This seat is being held, not booked");
    }

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

  // Joined on the config the purchase actually recorded. It used to be joined
  // on `creditsTotal = credits` — a guess that names the wrong product the
  // moment two configs sell the same number of classes.
  const result = await db
    .select()
    .from(bundles)
    .innerJoin(bundleConfig, eq(bundles.bundleConfigId, bundleConfig.id))
    .where(eq(bundles.id, id));

  if (result.length === 0) {
    throw new ApiError(404, "Bundle not found");
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
});
