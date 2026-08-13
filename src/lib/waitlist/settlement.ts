import { and, eq } from "drizzle-orm";
import type { db } from "@/lib/db";
import { bookings, waitlistEntries } from "@/lib/db/schema";
import { type OccupancyWriter, releaseSeat } from "@/lib/schedule-occupancy";

/**
 * Giving back the seat an offer was holding.
 *
 * An offer ends unanswered in two ways: Gabrielle withdraws it, or its deadline
 * passes with nobody having replied. As far as the seat is concerned those are
 * the same event, so they share this one path — what differs is only what
 * triggers it, and whether the recipient hears anything about it.
 *
 * The person stays on the waiting list either way. Taking them off is the
 * separate remove action, and the entry keeps its place in the queue.
 */

export type HeldSeatWriter = OccupancyWriter &
  Pick<typeof db, "update" | "delete">;

export type HeldSeat = {
  entryId: number;
  heldBookingId: number;
  scheduleId: number;
};

/**
 * Release the held seat and strip the offer from the waiting-list entry.
 *
 * `released: false` means the seat was not this offer's to give back by the time
 * the write ran — it had been taken up. Nothing is written to occupancy in that
 * case, and callers must not tell the customer their place has gone.
 */
export async function releaseHeldSeat(
  writer: HeldSeatWriter,
  seat: HeldSeat,
): Promise<{ released: boolean }> {
  // Clear the reference before the row it points at goes.
  await writer
    .update(waitlistEntries)
    .set({
      offeredAt: null,
      offerExpiresAt: null,
      offerToken: null,
      heldBookingId: null,
    })
    .where(eq(waitlistEntries.id, seat.entryId));

  // Guarded on `held`: a seat taken up in the meantime is a real booking and
  // must not be deleted, nor its occupancy given back.
  const removed = await writer
    .delete(bookings)
    .where(
      and(eq(bookings.id, seat.heldBookingId), eq(bookings.status, "held")),
    )
    .returning({ id: bookings.id });

  if (removed.length === 0) return { released: false };

  await releaseSeat(writer, seat.scheduleId);
  return { released: true };
}
