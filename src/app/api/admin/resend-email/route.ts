import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  describeBundleProduct,
  selectBundlesWithConfig,
} from "@/lib/bundles/with-config";
import { db } from "@/lib/db";
import { bookings, bundles, classes, schedules } from "@/lib/db/schema";
import { notify } from "@/lib/notifications";
import {
  bookingNotificationFor,
  recognisedKind,
} from "@/lib/notifications/booking-emails";
import type { DeliveryTable } from "@/lib/notifications/delivery";
import type { NotificationEvent } from "@/lib/notifications/events";
import { ApiError, withAdmin } from "../_lib";

const missingId = { error: "Missing id" };

const resendBody = z.object({
  type: z.enum(["booking", "bundle"], { error: "Invalid type" }),
  id: z.number(missingId).int(missingId).positive(missingId),
});

/**
 * Send, and record what happened either way.
 *
 * The flag is never consulted before sending: Gabrielle resends because a
 * customer told her nothing arrived, and "we recorded that it went" is exactly
 * the state she is disputing. A row whose flag is stuck true used to have no
 * button at all.
 */
async function resend(
  table: DeliveryTable,
  id: number,
  event: NotificationEvent,
) {
  const result = await notify(event, { on: table, row: id });
  if (!result.ok) {
    throw new ApiError(
      502,
      "The email could not be sent. It has been recorded as unsent and the overnight retry will try again.",
    );
  }
}

export const POST = withAdmin({ body: resendBody }, async ({ body }) => {
  const { type, id } = body;

  if (type === "booking") {
    const originalSchedules = alias(schedules, "original_schedules");

    const result = await db
      .select()
      .from(bookings)
      .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
      .innerJoin(classes, eq(schedules.classId, classes.id))
      // The bundle the booking was funded from, when there is one — a resend
      // has to know a credit was spent, or it quotes a price nobody paid.
      .leftJoin(bundles, eq(bookings.bundleId, bundles.id))
      // The class it was moved off, for a booking whose pending notification is
      // the moved-date note rather than a confirmation.
      .leftJoin(
        originalSchedules,
        eq(bookings.originalScheduleId, originalSchedules.id),
      )
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

    // Which email this booking is owed is the row's to say, not this route's.
    // Sending a confirmation to someone owed a moved-date note — and then
    // marking the row settled — took the note out of the sweep and it was never
    // sent by anything, which is the drift this whole change is about.
    const kind = recognisedKind(row.bookings.emailKind);
    if (kind === null) {
      throw new ApiError(
        400,
        `This booking is owed a "${row.bookings.emailKind}" email, which is not one this can send`,
      );
    }

    await resend(bookings, id, bookingNotificationFor(row, kind));

    return NextResponse.json({ success: true });
  }

  const result = await selectBundlesWithConfig().where(eq(bundles.id, id));

  if (result.length === 0) {
    throw new ApiError(404, "Bundle not found");
  }

  // Named from the config the purchase recorded, through the join the overnight
  // retry uses — one definition, so the two paths cannot name different products
  // for the same bundle.
  const product = describeBundleProduct(result[0]);
  if (!product.ok) {
    throw new ApiError(400, product.error);
  }

  await resend(bundles, id, {
    type: "bundle-purchased",
    customerEmail: product.customerEmail,
    bundleName: product.bundleName,
    credits: product.credits,
    expiryDate: product.expiryDate,
  });

  return NextResponse.json({ success: true });
});
