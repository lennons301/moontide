import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { notifyAfterResponse } from "@/lib/notifications";
import { claimSeat } from "@/lib/schedule-occupancy";
import { londonWallClockToUtc } from "@/lib/time/london";
import {
  countOutstandingOffers,
  findHeldBookingStatus,
  findWaitlistEntry,
} from "@/lib/waitlist/held-seats";
import {
  decideMakeOffer,
  decideWithdrawOffer,
  HOLD_DURATIONS,
} from "@/lib/waitlist/offers";
import { releaseHeldSeat } from "@/lib/waitlist/settlement";
import { ApiError, refuse, withAdmin } from "../../_lib";

/**
 * Possession of this link is the sole authorisation to take the seat, matching
 * the posture bundle redemption already has: an email address and nothing else.
 * 32 random bytes, URL-safe.
 */
function newOfferToken() {
  return randomBytes(32).toString("base64url");
}

const missingEntryId = { error: "Missing entryId" };

const entryId = z
  .number(missingEntryId)
  .int(missingEntryId)
  .positive(missingEntryId);

const offerBody = z.object({
  entryId,
  hold: z.enum(HOLD_DURATIONS, {
    error: "Choose a hold of 24 hours, 48 hours, or until the class",
  }),
});

/** Offer the free seat to one named person on the waiting list. */
export const POST = withAdmin({ body: offerBody }, async ({ body }) => {
  const { hold } = body;

  const entry = await findWaitlistEntry(body.entryId);

  const scheduleRows = entry
    ? await db
        .select()
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id))
        .where(eq(schedules.id, entry.scheduleId))
    : [];
  const schedule = scheduleRows[0]?.schedules ?? null;
  const classInfo = scheduleRows[0]?.classes ?? null;

  const offersOutstanding = schedule
    ? await countOutstandingOffers(schedule.id)
    : 0;

  const decision = decideMakeOffer({
    entry,
    heldBookingStatus: await findHeldBookingStatus(
      entry?.heldBookingId ?? null,
    ),
    schedule,
    offersOutstanding,
    hold,
    // The class starts at what Gabrielle wrote on the calendar, London time.
    classStartsAt: schedule
      ? londonWallClockToUtc(schedule.date, schedule.startTime)
      : new Date(0),
    now: new Date(),
  });

  if (!decision.ok) refuse(decision);
  if (!schedule || !classInfo) {
    throw new ApiError(404, "Schedule not found");
  }

  const token = newOfferToken();

  await db.transaction(async (tx) => {
    // The seat is genuinely held: it occupies capacity, so the class reads as
    // full to the public through the mechanism it always used. The guard is
    // the claim's own WHERE clause, so offers can never outnumber free seats
    // even if a booking landed since the read above.
    const claim = await claimSeat(tx, schedule.id);
    if (!claim.claimed) {
      throw new ApiError(400, "There is no free seat to offer on this class");
    }

    let heldBookingId: number;
    try {
      const inserted = await tx
        .insert(bookings)
        .values({
          scheduleId: schedule.id,
          customerName: decision.entry.customerName,
          customerEmail: decision.entry.customerEmail,
          status: "held",
          classTitle: classInfo.title,
        })
        .returning({ id: bookings.id });
      heldBookingId = inserted[0].id;
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new ApiError(409, "They already have a booking for this class");
      }
      throw error;
    }

    await tx
      .update(waitlistEntries)
      .set({
        offeredAt: new Date(),
        offerExpiresAt: decision.expiresAt,
        offerToken: token,
        heldBookingId,
      })
      .where(eq(waitlistEntries.id, decision.entry.id));
  });

  notifyAfterResponse(
    {
      type: "seat-offered",
      customerName: decision.entry.customerName,
      customerEmail: decision.entry.customerEmail,
      classTitle: classInfo.title,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      location: schedule.location,
      expiresAt: decision.expiresAt,
      offerToken: token,
    },
    {
      // Deliberately not retried, and so carries no delivery state. An offer is
      // a hold with a deadline on it: a copy sent overnight could arrive after
      // the seat has already gone back, inviting someone to take a place that
      // is not there. Re-offering the same person overwrites the offer and
      // sends it again, which is Gabrielle's move to make, and the daily digest
      // lists every outstanding offer so an unanswered one still reaches her.
      notRecorded:
        "a hold with a deadline: a copy sent overnight could invite someone to a seat that has gone back",
    },
  );

  return NextResponse.json({
    success: true,
    expiresAt: decision.expiresAt.toISOString(),
  });
});

const withdrawQuery = z.object({
  entryId: z.coerce
    .number(missingEntryId)
    .int(missingEntryId)
    .positive(missingEntryId),
});

/**
 * Withdraw an outstanding offer, freeing the seat. The person stays on the
 * waiting list — taking them off is the separate remove action — and nothing is
 * sent to them, because Gabrielle has already replied herself.
 */
export const DELETE = withAdmin({ query: withdrawQuery }, async ({ query }) => {
  const entry = await findWaitlistEntry(query.entryId);
  const decision = decideWithdrawOffer({
    entry,
    heldBookingStatus: await findHeldBookingStatus(
      entry?.heldBookingId ?? null,
    ),
  });

  if (!decision.ok) refuse(decision);

  // The same path an expiring offer takes: the two differ only in what
  // triggers them and in whether the recipient is told.
  await db.transaction(async (tx) => {
    await releaseHeldSeat(tx, {
      entryId: decision.entry.id,
      heldBookingId: decision.heldBookingId,
      scheduleId: decision.entry.scheduleId,
    });
  });

  return NextResponse.json({ withdrawn: true });
});
