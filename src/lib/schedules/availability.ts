/**
 * Whether a schedule can take a booking, and how many seats are left. One
 * definition, asked by every write path and every read that renders
 * availability.
 *
 * THE DECISION (#87): fullness is **derived**, never declared.
 *
 * It used to be both. `bookedCount >= capacity` was restated in nine places,
 * three of which also honoured a `status = 'full'` flag that nothing in the
 * application ever wrote — so a class Gabrielle marked full by hand was still
 * bookable: `claimSeat` ignored the flag, `/api/book/redeem` took a bundle
 * credit for it and the reschedule sheet still offered it as a destination.
 *
 * So there is no `'full'` status any more. Fullness is a fact about occupancy
 * and is computed here from `capacity` and `bookedCount`; it cannot go stale
 * because nothing stores it. What Gabrielle used the flag for — closing a class
 * to bookings while it still has seats — is the separate, declared `'closed'`
 * status, and `status` now says only what she has decided: open, closed by her,
 * or cancelled.
 *
 * Consequences:
 * - A status this module does not know is **not** open. Bookability fails
 *   closed, so a status added to the enum without being thought about here
 *   refuses bookings rather than quietly admitting them.
 * - `claimSeat` enforces both halves in SQL (`src/lib/schedule-occupancy.ts`),
 *   so no route can book a closed or full class even by racing. The one
 *   exception is `forceClaimSeat`, for paths where the customer has already
 *   been charged: refusing them is the wrong outcome.
 * - The arithmetic sites (the offer summary, the digest, the reschedule sheet,
 *   the booking page) are showing seats remaining rather than deciding
 *   anything, so they keep doing arithmetic — but they get it from
 *   `seatsRemaining` here, so "remaining" has one definition too.
 *
 * Pure and dependency-free on purpose: the public booking page is a client
 * component and must be able to ask the same question the server does without
 * pulling the database schema into the browser bundle.
 */

/**
 * Every status a schedule can have. The source for the Postgres enum
 * (`src/lib/db/schema.ts`) and the admin request schema, so a value cannot
 * exist in the database that this module has never heard of.
 */
export const SCHEDULE_STATUSES = ["open", "closed", "cancelled"] as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

/** The one status that admits bookings. */
export const BOOKABLE_SCHEDULE_STATUS: ScheduleStatus = "open";

/** As much of a schedule row as any question here needs. */
export type ScheduleAvailability = {
  /** Widened to `string`: rows arrive from many reads, and unknown is closed. */
  status: string;
  capacity: number;
  /** Every seat taken — held offers and released seats included. */
  bookedCount: number;
};

export type ScheduleSeats = Pick<
  ScheduleAvailability,
  "capacity" | "bookedCount"
>;

/**
 * Seats the class would still admit. Clamped at zero: occupancy above capacity
 * is refused by a database constraint, but a row read mid-flight should still
 * report "none left" rather than a negative number.
 */
export function seatsRemaining(schedule: ScheduleSeats): number {
  return Math.max(0, schedule.capacity - schedule.bookedCount);
}

/** Full — every seat taken. Derived, so it is never out of date. */
export function isScheduleFull(schedule: ScheduleSeats): boolean {
  return seatsRemaining(schedule) === 0;
}

/**
 * Whether Gabrielle has this class open to bookings. Says nothing about seats:
 * an open class can still be full.
 */
export function isOpenToBookings(schedule: { status: string }): boolean {
  return schedule.status === BOOKABLE_SCHEDULE_STATUS;
}

/**
 * Can this schedule take a booking? Open, and with a seat left.
 *
 * The single answer. Where a refusal has to be explained — and the wording
 * differs between "closed" and "full" — ask `isOpenToBookings` and
 * `isScheduleFull` in that order rather than restating either.
 */
export function canTakeBooking(schedule: ScheduleAvailability): boolean {
  return isOpenToBookings(schedule) && !isScheduleFull(schedule);
}
