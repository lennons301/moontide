import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, schedules, waitlistEntries } from "@/lib/db/schema";
import {
  findHeldBookingStatus,
  findWaitlistEntry,
} from "@/lib/waitlist/held-seats";
import { hasOfferLapsed, summariseOfferOccupancy } from "@/lib/waitlist/offers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("scheduleId");
  const scheduleId = raw ? Number(raw) : NaN;

  if (!raw || Number.isNaN(scheduleId)) {
    return NextResponse.json({ error: "Missing scheduleId" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(waitlistEntries)
    .leftJoin(bookings, eq(waitlistEntries.heldBookingId, bookings.id))
    .where(eq(waitlistEntries.scheduleId, scheduleId))
    .orderBy(asc(waitlistEntries.createdAt));

  const scheduleRows = await db
    .select({
      capacity: schedules.capacity,
      bookedCount: schedules.bookedCount,
      status: schedules.status,
    })
    .from(schedules)
    .where(eq(schedules.id, scheduleId));
  const schedule = scheduleRows[0] ?? null;

  const heldSeats = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(eq(bookings.scheduleId, scheduleId), eq(bookings.status, "held")),
    );

  const now = new Date();
  const entries = rows.map((row) => {
    const entry = row.waitlist_entries;
    // The token stays out of the response: the link belongs in the recipient's
    // email, and nothing on this page needs it.
    const { offerToken: _token, ...rest } = entry;
    const outstanding =
      entry.heldBookingId !== null && row.bookings?.status === "held";
    return {
      ...rest,
      offer: outstanding
        ? {
            offeredAt: entry.offeredAt,
            expiresAt: entry.offerExpiresAt,
            expired: hasOfferLapsed(entry.offerExpiresAt, now),
          }
        : null,
    };
  });

  return NextResponse.json({
    entries,
    scheduleStatus: schedule?.status ?? null,
    occupancy: schedule
      ? {
          capacity: schedule.capacity,
          ...summariseOfferOccupancy({
            capacity: schedule.capacity,
            bookedCount: schedule.bookedCount,
            offersOutstanding: heldSeats.length,
          }),
        }
      : null,
  });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("id");
  const id = raw ? Number(raw) : NaN;

  if (!raw || Number.isNaN(id)) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Removing someone who is holding a seat would strand it, so the two actions
  // stay distinct: withdraw the offer first, then remove them if that is what
  // she meant. The system never infers one from the other.
  const entry = await findWaitlistEntry(id);
  if (entry?.heldBookingId) {
    const heldBookingStatus = await findHeldBookingStatus(entry.heldBookingId);
    if (heldBookingStatus === "held") {
      return NextResponse.json(
        {
          error:
            "This person has an offer outstanding — withdraw it first, then remove them",
        },
        { status: 409 },
      );
    }
  }

  const removed = await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .returning();

  if (removed.length === 0) {
    return NextResponse.json(
      { error: "Waitlist entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}
