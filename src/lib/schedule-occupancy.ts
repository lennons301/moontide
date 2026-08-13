import { and, eq, lt, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";

/**
 * Every change to `schedules.bookedCount` goes through this module. Routes must
 * not increment or decrement the column themselves — the three operations below
 * differ in ways that are correctness decisions, not stylistic ones.
 */

/** The root db client or an open transaction — both can run these writes. */
export type OccupancyWriter = Pick<typeof db, "update">;

/** Outcome of a guarded claim. Refusal is a value, never an exception. */
export type SeatClaim = { claimed: true } | { claimed: false };

/** Outcome of an unguarded claim: it always takes the seat. */
export type ForcedSeatClaim = { overCapacity: boolean };

/**
 * Take a seat only while occupancy is below capacity.
 *
 * The guard lives in the UPDATE's WHERE clause, so the check and the increment
 * are one statement: two simultaneous claims on one remaining place cannot both
 * succeed. Callers get `{ claimed: false }` — no throw — when the class is full.
 */
export async function claimSeat(
  writer: OccupancyWriter,
  scheduleId: number,
): Promise<SeatClaim> {
  const claimed = await writer
    .update(schedules)
    .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
    .where(
      and(
        eq(schedules.id, scheduleId),
        lt(schedules.bookedCount, schedules.capacity),
      ),
    )
    .returning({ id: schedules.id });

  return claimed.length > 0 ? { claimed: true } : { claimed: false };
}

/**
 * Take a seat whether or not capacity allows it.
 *
 * For paths where the customer has already been charged: refusing them is the
 * wrong outcome, so the claim succeeds and the breach is reported back instead.
 */
export async function forceClaimSeat(
  writer: OccupancyWriter,
  scheduleId: number,
): Promise<ForcedSeatClaim> {
  const rows = await writer
    .update(schedules)
    .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
    .where(eq(schedules.id, scheduleId))
    .returning({
      bookedCount: schedules.bookedCount,
      capacity: schedules.capacity,
    });

  const claimed = rows[0];
  return {
    overCapacity: claimed ? claimed.bookedCount > claimed.capacity : false,
  };
}

/** Free a seat. Clamped at zero, so occupancy can never go negative. */
export async function releaseSeat(
  writer: OccupancyWriter,
  scheduleId: number,
): Promise<void> {
  await writer
    .update(schedules)
    .set({ bookedCount: sql`GREATEST(${schedules.bookedCount} - 1, 0)` })
    .where(eq(schedules.id, scheduleId));
}
