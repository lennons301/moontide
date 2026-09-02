import { and, eq, gte, ne } from "drizzle-orm";
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
import { runDailyOfferWork } from "@/lib/waitlist/daily";

/**
 * The daily job. Email retries came first and name the route; the offer work
 * (settling offers nobody answered, and Gabrielle's digest) is folded in behind
 * them because this plan permits only daily schedules and we could not confirm
 * how many entries it permits. Both are safe to run late — see
 * `runDailyOfferWork`.
 */
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
    // The bundle the booking was funded from, when there is one: a retry has to
    // know a credit was spent, or it sends a cash price nobody paid.
    .leftJoin(bundles, eq(bookings.bundleId, bundles.id))
    // A held seat has no confirmation owing: nobody has taken the offer up, and
    // retrying would tell them their class is booked when it is not.
    .where(
      and(
        eq(bookings.emailSent, false),
        ne(bookings.status, "held"),
        gte(bookings.createdAt, cutoff),
      ),
    );

  for (const row of pendingBookings) {
    try {
      // A booking with a bundle behind it was paid for with a credit, so the
      // retry says so and states the balance. Only a booking with no bundle
      // gets a price.
      const payment = row.bundles
        ? ({
            method: "credit",
            creditsRemaining: row.bundles.creditsRemaining,
          } as const)
        : ({
            method: "card",
            priceInPence: row.classes.priceInPence,
          } as const);

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

  // Runs after the retries so a failure in the newer work cannot cost a customer
  // their confirmation email.
  const offerWork = await runDailyOfferWork();

  return NextResponse.json({
    retriedBookings: pendingBookings.length,
    retriedBundles: pendingBundles.length,
    succeeded: succeededBookings + succeededBundles,
    failed,
    expiredOffers: offerWork.expiredOffers,
    digest: offerWork.digest,
  });
}
