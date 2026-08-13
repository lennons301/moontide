import { and, eq, gt, ne } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bookings,
  bundles,
  classes,
  schedules,
  waitlistEntries,
} from "@/lib/db/schema";
import { sendBookingConfirmation } from "@/lib/email";
import { claimSeat } from "@/lib/schedule-occupancy";
import { findOfferByToken } from "@/lib/waitlist/held-seats";
import { decideRedemptionSeat } from "@/lib/waitlist/offers";

export async function POST(request: Request) {
  const { scheduleId, customerName, customerEmail, offerToken } =
    await request.json();

  if (!scheduleId || !customerName || !customerEmail) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const scheduleRows = await db
    .select({
      status: schedules.status,
      date: schedules.date,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      location: schedules.location,
      bundleEligible: classes.bundleEligible,
      classTitle: classes.title,
      priceInPence: classes.priceInPence,
    })
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(schedules.id, scheduleId));

  if (scheduleRows.length === 0) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const schedule = scheduleRows[0];

  // Bundle credits may only be spent on classes flagged as bundle-eligible.
  if (!schedule.bundleEligible) {
    return NextResponse.json(
      { error: "This class cannot be booked with a bundle" },
      { status: 400 },
    );
  }

  // A cancelled class takes no bookings by either payment path. Wording matches
  // the card path so the customer sees one message however they were booking.
  if (schedule.status === "cancelled") {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  const activeBundles = await db
    .select()
    .from(bundles)
    .where(
      and(
        eq(bundles.customerEmail, customerEmail),
        eq(bundles.status, "active"),
        gt(bundles.creditsRemaining, 0),
        gt(bundles.expiresAt, new Date()),
      ),
    );

  if (activeBundles.length === 0) {
    return NextResponse.json(
      { error: "No active bundle found" },
      { status: 404 },
    );
  }

  const bundle = activeBundles[0];

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.scheduleId, scheduleId),
        eq(bookings.customerEmail, customerEmail),
        ne(bookings.status, "cancelled"),
      ),
    );

  // Which seat this is for. A seat held by an offer is itself a non-cancelled
  // booking for this person and class, so without the token the duplicate check
  // below would refuse the very person it is being held for.
  const seat = decideRedemptionSeat({
    token: offerToken,
    offer: offerToken ? await findOfferByToken(offerToken) : null,
    request: { scheduleId, customerEmail },
    existingBookings: existingBooking,
    now: new Date(),
  });

  if (!seat.ok) {
    return NextResponse.json(
      { error: seat.error },
      { status: seat.httpStatus },
    );
  }

  const newCredits = bundle.creditsRemaining - 1;

  const spendCredit = (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) =>
    tx
      .update(bundles)
      .set({
        creditsRemaining: newCredits,
        status: newCredits === 0 ? "exhausted" : "active",
      })
      .where(eq(bundles.id, bundle.id));

  const outcome = await db.transaction(async (tx) => {
    if (seat.kind === "held-seat") {
      // The offer already counted this seat, so occupancy must not move: the
      // held booking becomes the confirmed one rather than a second booking
      // appearing beside it. Guarded on `held` so a seat taken up in the
      // meantime cannot be spent on twice.
      const converted = await tx
        .update(bookings)
        .set({ status: "confirmed", bundleId: bundle.id })
        .where(
          and(eq(bookings.id, seat.bookingId), eq(bookings.status, "held")),
        )
        .returning({ id: bookings.id });

      if (converted.length === 0) return { ok: false as const, reason: "gone" };

      // Acceptance takes the offer with the entry — a confirmed booking carries
      // no offer residue.
      await tx
        .delete(waitlistEntries)
        .where(eq(waitlistEntries.id, seat.waitlistEntryId));

      await spendCredit(tx);
      return { ok: true as const, bookingId: seat.bookingId };
    }

    // Capacity is enforced by the claim, not by a read taken beforehand: the
    // guard is the UPDATE's own WHERE clause, so two redemptions racing for one
    // remaining place cannot both win. Nothing has been written when the claim
    // is refused, so returning early leaves the booking, the credit and the
    // occupancy count untouched — the credit is still the customer's to spend.
    const claim = await claimSeat(tx, scheduleId);

    if (!claim.claimed) return { ok: false as const, reason: "full" };

    const inserted = await tx
      .insert(bookings)
      .values({
        scheduleId,
        customerName,
        customerEmail,
        bundleId: bundle.id,
      })
      .returning({ id: bookings.id });

    await spendCredit(tx);
    return { ok: true as const, bookingId: inserted[0]?.id };
  });

  if (!outcome.ok) {
    if (outcome.reason === "gone") {
      return NextResponse.json(
        { error: "This offer has already been taken up" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Class is full" }, { status: 400 });
  }

  if (seat.kind === "held-seat") {
    // Taking up an offer is a booking like any other, so it gets the existing
    // confirmation unchanged. (Ordinary redemptions send nothing today; that is
    // left as it was.)
    const bookingId = outcome.bookingId;
    after(async () => {
      try {
        await sendBookingConfirmation({
          customerName,
          customerEmail,
          classTitle: schedule.classTitle,
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          location: schedule.location,
          priceInPence: schedule.priceInPence,
        });
        if (bookingId !== undefined) {
          await db
            .update(bookings)
            .set({ emailSent: true })
            .where(eq(bookings.id, bookingId));
        }
      } catch (e) {
        console.error("Offer acceptance email send failed", e);
      }
    });
  }

  return NextResponse.json({ success: true, creditsRemaining: newCredits });
}
