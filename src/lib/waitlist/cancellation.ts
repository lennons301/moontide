import { and, eq } from "drizzle-orm";
import type { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { type OccupancyWriter, releaseSeats } from "@/lib/schedule-occupancy";

/**
 * What cancelling a class does to the offers outstanding on it.
 *
 * A held seat is a promise of a place on a class that is now not happening, so
 * cancelling the class voids it: the held booking is cancelled and its seat goes
 * back, leaving occupancy telling the truth about a class nobody is attending.
 *
 * This is a consequence of cancelling, never a step Gabrielle has to remember.
 * She cancels at short notice and under pressure, so nothing here blocks or
 * gates the cancellation — a class with no offers on it is untouched, and one
 * with offers is cancelled just as readily.
 *
 * The waiting-list entry is deliberately left alone. Its token still resolves,
 * which is what lets `/book/offer/[token]` say plainly that the class has been
 * cancelled instead of implying the place was taken by someone else; and the
 * person stays on the list, as they do when an offer is withdrawn. Nothing is
 * sent to them from here — Gabrielle tells people herself when she cancels.
 */

export type OfferVoidWriter = OccupancyWriter & Pick<typeof db, "update">;

export async function voidOffersOnCancellation(
  writer: OfferVoidWriter,
  scheduleId: number,
): Promise<{ voided: number }> {
  // Guarded on `held` in the write itself, so a seat taken up in the meantime is
  // a real booking and is neither cancelled here nor counted as a seat to give
  // back. Exactly as many seats are freed as bookings were cancelled.
  const cancelled = await writer
    .update(bookings)
    .set({ status: "cancelled" })
    .where(
      and(eq(bookings.scheduleId, scheduleId), eq(bookings.status, "held")),
    )
    .returning({ id: bookings.id });

  await releaseSeats(writer, scheduleId, cancelled.length);

  return { voided: cancelled.length };
}
