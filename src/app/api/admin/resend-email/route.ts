import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  describeBundleProduct,
  selectBundlesWithConfig,
} from "@/lib/bundles/with-config";
import { db } from "@/lib/db";
import { bookings, bundles, classes, schedules } from "@/lib/db/schema";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
} from "@/lib/email";
import { markEmailFailed, markEmailSent } from "@/lib/notifications/delivery";
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
  table: Parameters<typeof markEmailSent>[0],
  id: number,
  send: () => Promise<void>,
) {
  try {
    await send();
  } catch (error) {
    await markEmailFailed(table, id, error);
    console.error(
      `Resend failed for ${table === bookings ? "booking" : "bundle"} ${id}:`,
      error,
    );
    throw new ApiError(
      502,
      "The email could not be sent. It has been recorded as unsent and the overnight retry will try again.",
    );
  }
  await markEmailSent(table, id);
}

export const POST = withAdmin({ body: resendBody }, async ({ body }) => {
  const { type, id } = body;

  if (type === "booking") {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
      .innerJoin(classes, eq(schedules.classId, classes.id))
      // The bundle the booking was funded from, when there is one — a resend
      // has to know a credit was spent, or it quotes a price nobody paid.
      .leftJoin(bundles, eq(bookings.bundleId, bundles.id))
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

    const payment = row.bundles
      ? ({
          method: "credit",
          creditsRemaining: row.bundles.creditsRemaining,
        } as const)
      : ({
          method: "card",
          priceInPence: row.classes.priceInPence,
        } as const);

    await resend(bookings, id, async () => {
      await sendBookingConfirmation({
        customerName: row.bookings.customerName,
        customerEmail: row.bookings.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        location: row.schedules.location,
        payment,
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
        payment,
      });
    });

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

  await resend(bundles, id, async () => {
    await sendBundleConfirmation({
      customerEmail: product.customerEmail,
      bundleName: product.bundleName,
      credits: product.credits,
      expiryDate: product.expiryDate,
    });

    await sendBookingNotification({
      type: "bundle",
      customerEmail: product.customerEmail,
      bundleName: product.bundleName,
      credits: product.credits,
      expiryDate: product.expiryDate,
    });
  });

  return NextResponse.json({ success: true });
});
