import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { sendSeatOffer } from "@/lib/email";
import { claimSeat, releaseSeat } from "@/lib/schedule-occupancy";
import { londonWallClockToUtc } from "@/lib/time/london";
import {
  countOutstandingOffers,
  findHeldBookingStatus,
  findWaitlistEntry,
} from "@/lib/waitlist/held-seats";
import {
  decideMakeOffer,
  decideWithdrawOffer,
  isHoldDuration,
} from "@/lib/waitlist/offers";

/** Signals that the seat was gone by the time the guarded claim ran. */
class NoFreeSeatError extends Error {}
/** Signals that the person already holds an active booking for this class. */
class AlreadyBookedError extends Error {}

/**
 * Possession of this link is the sole authorisation to take the seat, matching
 * the posture bundle redemption already has: an email address and nothing else.
 * 32 random bytes, URL-safe.
 */
function newOfferToken() {
  return randomBytes(32).toString("base64url");
}

function parseEntryId(request: Request, fromBody?: unknown) {
  if (fromBody !== undefined) {
    const value = Number(fromBody);
    return Number.isNaN(value) ? null : value;
  }
  const raw = new URL(request.url).searchParams.get("entryId");
  const value = raw ? Number(raw) : Number.NaN;
  return raw && !Number.isNaN(value) ? value : null;
}

/** Offer the free seat to one named person on the waiting list. */
export async function POST(request: Request) {
  const body = await request.json();
  const { entryId: rawEntryId, hold } = body as {
    entryId?: number;
    hold?: string;
  };

  const entryId = parseEntryId(request, rawEntryId);
  if (entryId === null) {
    return NextResponse.json({ error: "Missing entryId" }, { status: 400 });
  }
  if (!isHoldDuration(hold)) {
    return NextResponse.json(
      { error: "Choose a hold of 24 hours, 48 hours, or until the class" },
      { status: 400 },
    );
  }

  const entry = await findWaitlistEntry(entryId);

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

  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.error },
      { status: decision.httpStatus },
    );
  }
  if (!schedule || !classInfo) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const token = newOfferToken();

  try {
    await db.transaction(async (tx) => {
      // The seat is genuinely held: it occupies capacity, so the class reads as
      // full to the public through the mechanism it always used. The guard is
      // the claim's own WHERE clause, so offers can never outnumber free seats
      // even if a booking landed since the read above.
      const claim = await claimSeat(tx, schedule.id);
      if (!claim.claimed) throw new NoFreeSeatError();

      let heldBookingId: number;
      try {
        const inserted = await tx
          .insert(bookings)
          .values({
            scheduleId: schedule.id,
            customerName: decision.entry.customerName,
            customerEmail: decision.entry.customerEmail,
            status: "held",
          })
          .returning({ id: bookings.id });
        heldBookingId = inserted[0].id;
      } catch (error) {
        if ((error as { code?: string })?.code === "23505") {
          throw new AlreadyBookedError();
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
  } catch (error) {
    if (error instanceof NoFreeSeatError) {
      return NextResponse.json(
        { error: "There is no free seat to offer on this class" },
        { status: 400 },
      );
    }
    if (error instanceof AlreadyBookedError) {
      return NextResponse.json(
        { error: "They already have a booking for this class" },
        { status: 409 },
      );
    }
    throw error;
  }

  after(async () => {
    try {
      await sendSeatOffer({
        customerName: decision.entry.customerName,
        customerEmail: decision.entry.customerEmail,
        classTitle: classInfo.title,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        location: schedule.location,
        expiresAt: decision.expiresAt,
        offerUrl: `${process.env.BETTER_AUTH_URL}/book/offer/${token}`,
      });
    } catch (e) {
      console.error("Seat offer email send failed", e);
    }
  });

  return NextResponse.json({
    success: true,
    expiresAt: decision.expiresAt.toISOString(),
  });
}

/**
 * Withdraw an outstanding offer, freeing the seat. The person stays on the
 * waiting list — taking them off is the separate remove action — and nothing is
 * sent to them, because Gabrielle has already replied herself.
 */
export async function DELETE(request: Request) {
  const entryId = parseEntryId(request);
  if (entryId === null) {
    return NextResponse.json({ error: "Missing entryId" }, { status: 400 });
  }

  const entry = await findWaitlistEntry(entryId);
  const decision = decideWithdrawOffer({
    entry,
    heldBookingStatus: await findHeldBookingStatus(
      entry?.heldBookingId ?? null,
    ),
  });

  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.error },
      { status: decision.httpStatus },
    );
  }

  await db.transaction(async (tx) => {
    // Clear the reference before the row it points at goes.
    await tx
      .update(waitlistEntries)
      .set({
        offeredAt: null,
        offerExpiresAt: null,
        offerToken: null,
        heldBookingId: null,
      })
      .where(eq(waitlistEntries.id, decision.entry.id));

    // Guarded on `held`: a seat taken up in the meantime is a real booking and
    // must not be deleted, nor its occupancy given back.
    const removed = await tx
      .delete(bookings)
      .where(
        and(
          eq(bookings.id, decision.heldBookingId),
          eq(bookings.status, "held"),
        ),
      )
      .returning({ id: bookings.id });

    if (removed.length > 0) {
      await releaseSeat(tx, decision.entry.scheduleId);
    }
  });

  return NextResponse.json({ withdrawn: true });
}
