import { and, eq, ne } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bookings,
  bundleConfig,
  bundles,
  classes,
  schedules,
  waitlistEntries,
} from "@/lib/db/schema";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
} from "@/lib/email";
import { forceClaimSeat } from "@/lib/schedule-occupancy";
import { getStripe } from "@/lib/stripe";
import { findOfferByToken } from "@/lib/waitlist/held-seats";
import { decidePaidSeat } from "@/lib/waitlist/offers";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata;

    if (metadata?.type === "individual") {
      const scheduleId = Number.parseInt(metadata.scheduleId, 10);
      const offerToken = metadata.offerToken || null;
      const heldBookingId = metadata.heldBookingId
        ? Number.parseInt(metadata.heldBookingId, 10)
        : null;

      // Bookings this customer already has for this class. A seat held for them
      // by an offer is one of these, so it must never be read as a duplicate
      // delivery: that would keep the money and leave the seat held.
      const existingBooking = await db
        .select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(
          and(
            eq(bookings.scheduleId, scheduleId),
            eq(bookings.customerEmail, metadata.customerEmail),
            ne(bookings.status, "cancelled"),
          ),
        );

      const seat = decidePaidSeat({
        token: offerToken,
        heldBookingId,
        offer: offerToken ? await findOfferByToken(offerToken) : null,
        request: { scheduleId, customerEmail: metadata.customerEmail },
        existingBookings: existingBooking,
      });

      // A repeated delivery finds the booking already there — including the
      // held seat an earlier delivery converted — and writes nothing further.
      if (seat.kind === "already-booked") {
        return NextResponse.json({ received: true });
      }

      if (seat.kind === "convert-held-seat") {
        const converted = await db.transaction(async (tx) => {
          // Converted in place, and occupancy deliberately untouched: the offer
          // counted this seat when it was made. Guarded on `held` so a seat
          // taken up by the credit path in between is left as it is.
          const rows = await tx
            .update(bookings)
            .set({ status: "confirmed", stripePaymentId: session.id })
            .where(
              and(eq(bookings.id, seat.bookingId), eq(bookings.status, "held")),
            )
            .returning({ id: bookings.id });

          if (rows.length === 0) return false;

          // Acceptance takes the offer with the entry, exactly as the credit
          // path does — a confirmed booking carries no offer residue.
          await tx
            .delete(waitlistEntries)
            .where(eq(waitlistEntries.id, seat.waitlistEntryId));

          return true;
        });

        // The seat went elsewhere between the read and the write. Whoever took
        // it up is being told about it; this delivery adds nothing.
        if (!converted) {
          return NextResponse.json({ received: true });
        }
      } else {
        await db.transaction(async (tx) => {
          await tx.insert(bookings).values({
            scheduleId,
            customerName: metadata.customerName,
            customerEmail: metadata.customerEmail,
            stripePaymentId: session.id,
          });
          // The customer has already paid, so the seat is taken regardless of
          // capacity: refusing someone who has been charged is the wrong
          // outcome. A full class has its capacity raised to admit the seat,
          // and the raise is logged rather than swallowed: it is a change to a
          // number Gabrielle set, made by a sale rather than by her.
          const claim = await forceClaimSeat(tx, scheduleId);
          if (claim.capacityRaised) {
            console.error(
              `Capacity raised: schedule ${scheduleId} was full and took paid booking ${session.id}`,
            );
          }
        });
      }

      after(async () => {
        try {
          const result = await db
            .select()
            .from(schedules)
            .innerJoin(classes, eq(schedules.classId, classes.id))
            .where(eq(schedules.id, scheduleId));

          if (result.length > 0) {
            const schedule = result[0].schedules;
            const classInfo = result[0].classes;

            await sendBookingConfirmation({
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
              priceInPence: classInfo.priceInPence,
            });

            await sendBookingNotification({
              type: "individual",
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
            });

            await db
              .update(bookings)
              .set({ emailSent: true })
              .where(eq(bookings.stripePaymentId, session.id));
          }
        } catch (error) {
          console.error("Failed to send booking confirmation email:", error);
        }
      });
    } else if (metadata?.type === "bundle") {
      const configId = Number.parseInt(metadata.bundleConfigId, 10);
      const configs = await db
        .select()
        .from(bundleConfig)
        .where(eq(bundleConfig.id, configId));

      const config = configs[0];
      if (!config) {
        console.error(
          `Bundle config not found for id: ${configId}, session: ${session.id}`,
        );
        return NextResponse.json(
          { error: "Bundle config not found" },
          { status: 500 },
        );
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + config.expiryDays);

      // `stripe_payment_id` is unique, so a redelivered event conflicts rather
      // than granting a second bundle of free credits. Nothing to insert means
      // an earlier delivery already did the work — including the email.
      const inserted = await db
        .insert(bundles)
        .values({
          customerEmail: metadata.customerEmail,
          creditsTotal: config.credits,
          creditsRemaining: config.credits,
          stripePaymentId: session.id,
          bundleConfigId: config.id,
          expiresAt,
        })
        .onConflictDoNothing({ target: bundles.stripePaymentId })
        .returning({ id: bundles.id });

      if (inserted.length === 0) {
        return NextResponse.json({ received: true });
      }

      const expiryDateFormatted = expiresAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      after(async () => {
        try {
          await sendBundleConfirmation({
            customerEmail: metadata.customerEmail,
            bundleName: config.name,
            credits: config.credits,
            expiryDate: expiryDateFormatted,
          });

          await sendBookingNotification({
            type: "bundle",
            customerEmail: metadata.customerEmail,
            bundleName: config.name,
            credits: config.credits,
            expiryDate: expiryDateFormatted,
          });

          await db
            .update(bundles)
            .set({ emailSent: true })
            .where(eq(bundles.stripePaymentId, session.id));
        } catch (error) {
          console.error("Failed to send bundle confirmation email:", error);
        }
      });
    }
  }

  return NextResponse.json({ received: true });
}
