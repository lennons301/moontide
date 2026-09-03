import { and, eq, ne } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import {
  bundleConfigIdFromSession,
  bundleExpiry,
  bundlePaidAt,
  decideBundleTerms,
} from "@/lib/bundles/purchase";
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
  sendBundleConfigMissingAlert,
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
            // This path is only ever reached by a Stripe payment.
            const payment = {
              method: "card",
              priceInPence: classInfo.priceInPence,
            } as const;

            await sendBookingConfirmation({
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
              payment,
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
              payment,
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
      const configId = bundleConfigIdFromSession(metadata);
      const configs = configId
        ? await db
            .select()
            .from(bundleConfig)
            .where(eq(bundleConfig.id, configId))
        : [];

      // The config is read for the foreign key and as the fallback for a
      // session created before the terms travelled with it — never as the
      // source of terms a session of its own carries.
      const decision = decideBundleTerms({
        metadata,
        config: configs[0] ?? null,
      });

      // The one thing that tells anyone the product a purchase named is gone:
      // Stripe is answered 200 either way, so nothing else would.
      const raiseMissingConfig = (
        granted: { credits: number; expiryDate: string } | null,
      ) => {
        after(async () => {
          try {
            await sendBundleConfigMissingAlert({
              customerEmail: metadata.customerEmail,
              sessionId: session.id,
              configReference: metadata.bundleConfigId || "none",
              granted,
            });
          } catch (error) {
            console.error("Failed to send bundle config alert:", error);
          }
        });
      };

      // Nothing left to grant from. The condition is permanent — the row is
      // gone, or the session named nothing — so Stripe is told the event was
      // received rather than being made to retry it identically for three
      // days, and Gabrielle is told instead: someone has paid for nothing.
      if (!decision.ok) {
        console.error(
          `Bundle not granted (${decision.reason}) for session: ${session.id}`,
        );
        raiseMissingConfig(null);
        return NextResponse.json({ received: true });
      }

      const {
        name,
        credits,
        expiryDays,
        configId: purchasedConfigId,
      } = decision.terms;
      const expiresAt = bundleExpiry(bundlePaidAt(session.created), expiryDays);

      // `stripe_payment_id` is unique, so a redelivered event conflicts rather
      // than granting a second bundle of free credits. Nothing to insert means
      // an earlier delivery already did the work — including the email.
      const inserted = await db
        .insert(bundles)
        .values({
          customerEmail: metadata.customerEmail,
          creditsTotal: credits,
          creditsRemaining: credits,
          stripePaymentId: session.id,
          bundleConfigId: purchasedConfigId,
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

      // Granted in full from what she was sold, but the product it points at
      // has gone: worth a word, because nothing else records that.
      if (purchasedConfigId === null) {
        raiseMissingConfig({ credits, expiryDate: expiryDateFormatted });
      }

      after(async () => {
        try {
          await sendBundleConfirmation({
            customerEmail: metadata.customerEmail,
            bundleName: name,
            credits,
            expiryDate: expiryDateFormatted,
          });

          await sendBookingNotification({
            type: "bundle",
            customerEmail: metadata.customerEmail,
            bundleName: name,
            credits,
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
