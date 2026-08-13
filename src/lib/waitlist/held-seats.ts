import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, waitlistEntries } from "@/lib/db/schema";
import type { ClaimedOffer } from "@/lib/waitlist/offers";

/**
 * The reads the offer decisions need. Kept together so every route asks the
 * same questions of the same rows — the decisions themselves live in
 * `@/lib/waitlist/offers` and touch no database.
 */

export async function findWaitlistEntry(entryId: number) {
  const rows = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, entryId));
  return rows[0] ?? null;
}

/** Status of the booking an entry holds, or null when it holds none. */
export async function findHeldBookingStatus(heldBookingId: number | null) {
  if (heldBookingId === null || heldBookingId === undefined) return null;
  const rows = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, heldBookingId));
  return rows[0]?.status ?? null;
}

/**
 * Read an offer back from the token in the recipient's link, together with the
 * status of the seat it holds. Whether the token is any good is decided by
 * `decideRedemptionSeat`, not here.
 */
export async function findOfferByToken(
  token: string,
): Promise<ClaimedOffer | null> {
  const rows = await db
    .select({ entry: waitlistEntries, heldBookingStatus: bookings.status })
    .from(waitlistEntries)
    .leftJoin(bookings, eq(waitlistEntries.heldBookingId, bookings.id))
    .where(eq(waitlistEntries.offerToken, token));

  const row = rows[0];
  if (!row) return null;

  return { ...row.entry, heldBookingStatus: row.heldBookingStatus ?? null };
}

/** Seats on this class held by an offer nobody has taken up yet. */
export async function countOutstandingOffers(scheduleId: number) {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(eq(bookings.scheduleId, scheduleId), eq(bookings.status, "held")),
    );
  return rows.length;
}
