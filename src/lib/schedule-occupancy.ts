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

/**
 * Outcome of an unguarded claim: it always takes the seat. `capacityRaised`
 * says the class was full and its capacity moved up to admit the seat.
 */
export type ForcedSeatClaim = { capacityRaised: boolean };

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
 * wrong outcome. So when the class is full the seat is still taken, and the
 * class's capacity moves up with it — `booked_count <= capacity` is a database
 * constraint, and occupancy must not claim seats the class does not admit.
 * The raise is reported back rather than swallowed — it is a real change to a
 * number Gabrielle set, made by a sale rather than by her — and the caller
 * logs it.
 */
export async function forceClaimSeat(
  writer: OccupancyWriter,
  scheduleId: number,
): Promise<ForcedSeatClaim> {
  // Below capacity there is nothing to force: the guarded claim takes the seat
  // and leaves the capacity Gabrielle set alone.
  const claim = await claimSeat(writer, scheduleId);
  if (claim.claimed) return { capacityRaised: false };

  // Full — or gone. GREATEST rather than an assignment because a seat may have
  // been freed since the claim above failed, and capacity must never come
  // down: reducing it is Gabrielle's decision, never a side effect of a sale.
  // In that (vanishing) case the seat is taken, capacity stays where it is and
  // the flag over-reports — a log line, not a decision.
  const raised = await writer
    .update(schedules)
    .set({
      bookedCount: sql`${schedules.bookedCount} + 1`,
      capacity: sql`GREATEST(${schedules.capacity}, ${schedules.bookedCount} + 1)`,
    })
    .where(eq(schedules.id, scheduleId))
    .returning({ id: schedules.id });

  return { capacityRaised: raised.length > 0 };
}

/**
 * Free several seats at once. Clamped at zero, so occupancy can never go
 * negative, and a single statement so a batch release cannot be half applied.
 * Freeing nothing writes nothing.
 */
export async function releaseSeats(
  writer: OccupancyWriter,
  scheduleId: number,
  seats: number,
): Promise<void> {
  if (seats <= 0) return;
  await writer
    .update(schedules)
    .set({
      bookedCount: sql`GREATEST(${schedules.bookedCount} - ${seats}, 0)`,
    })
    .where(eq(schedules.id, scheduleId));
}

/** Free a seat. Clamped at zero, so occupancy can never go negative. */
export async function releaseSeat(
  writer: OccupancyWriter,
  scheduleId: number,
): Promise<void> {
  await releaseSeats(writer, scheduleId, 1);
}
