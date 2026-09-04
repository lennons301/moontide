import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findSpendableBundle, spendCredit } from "@/lib/bundles/credits";
import { emailMatches, normaliseEmail } from "@/lib/customers/email";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { notifyAfterResponse } from "@/lib/notifications";
import { claimSeat } from "@/lib/schedule-occupancy";
import { isOpenToBookings } from "@/lib/schedules/availability";
import { findOfferByToken } from "@/lib/waitlist/held-seats";
import { decideRedemptionSeat } from "@/lib/waitlist/offers";

/**
 * The bundle had a credit on it when it was read, a moment before the
 * transaction opened. Whether it still has one is settled by the debit's own
 * guard, inside the transaction — and this throw is both that refusal and the
 * rollback of the booking that was about to be made against it.
 */
class CreditGone extends Error {}

export async function POST(request: Request) {
  const body = await request.json();
  const { scheduleId, customerName, offerToken } = body;

  // Normalised once, here: the bundle is looked for under this address, the
  // booking is written with it, and the confirmation goes to it.
  const customerEmail = normaliseEmail(body.customerEmail);

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

  // A cancelled class takes no bookings by either payment path, offer or no
  // offer. Wording matches the card path so the customer sees one message
  // however they were booking.
  if (schedule.status === "cancelled") {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  // Nor does a class Gabrielle has closed. `claimSeat` refuses it in the same
  // statement that takes the seat, so this read only chooses the wording — but
  // an offer token is exempt here as it is on the card path
  // (`decideCheckoutSeat`): closing stops new bookings and does not take back a
  // seat already held for someone. A held seat never reaches `claimSeat`
  // anyway; the booking is converted in place, and occupancy does not move.
  if (!offerToken && !isOpenToBookings(schedule)) {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  const bundle = await findSpendableBundle(db, {
    customerEmail,
    now: new Date(),
  });

  if (!bundle) {
    return NextResponse.json(
      { error: "No active bundle found" },
      { status: 404 },
    );
  }

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.scheduleId, scheduleId),
        // Case-insensitive, so a booking made before addresses were normalised
        // is still recognised as this customer's rather than read as somebody
        // else with the same address in different capitals.
        emailMatches(bookings.customerEmail, customerEmail),
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

  const spend = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => {
    const spent = await spendCredit(tx, bundle.id);
    if (!spent.spent) throw new CreditGone();
    return spent.creditsRemaining;
  };

  const redeemed = db.transaction(async (tx) => {
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

      return {
        ok: true as const,
        bookingId: seat.bookingId,
        creditsRemaining: await spend(tx),
      };
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

    return {
      ok: true as const,
      bookingId: inserted[0]?.id,
      creditsRemaining: await spend(tx),
    };
  });

  const outcome = await redeemed.catch((e) => {
    if (e instanceof CreditGone) return { ok: false as const, reason: "spent" };
    throw e;
  });

  if (!outcome.ok) {
    if (outcome.reason === "gone") {
      return NextResponse.json(
        { error: "This offer has already been taken up" },
        { status: 409 },
      );
    }
    if (outcome.reason === "spent") {
      // Someone spent the last credit between the read and the debit. Nothing
      // was kept: the transaction was rolled back with it.
      return NextResponse.json(
        { error: "That bundle has no credits left" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Class is full" }, { status: 400 });
  }

  const bookingId = outcome.bookingId;

  // Every redemption is confirmed here, whether it came from an offer or
  // straight off the booking page: an ordinary redemption used to send nothing
  // and leave the customer to hope the overnight retry swept her booking up.
  notifyAfterResponse(
    {
      type: "booking-confirmed",
      customerName,
      customerEmail,
      classTitle: schedule.classTitle,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      location: schedule.location,
      // A credit was spent, so that is what both copies say — the class list
      // price is money this customer never paid. `creditsRemaining` is the
      // balance the guarded debit actually wrote, not one computed here.
      payment: {
        method: "credit",
        creditsRemaining: outcome.creditsRemaining,
      },
    },
    bookingId === undefined
      ? { notRecorded: "the insert returned no id to record against" }
      : { on: bookings, row: bookingId },
  );

  return NextResponse.json({
    success: true,
    creditsRemaining: outcome.creditsRemaining,
  });
}
