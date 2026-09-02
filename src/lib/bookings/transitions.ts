/**
 * Pure decision seam for admin booking transitions.
 *
 * These functions take the state that has already been read from the database
 * and return the transition that should be applied. They touch no database and
 * no framework, so the rules can be tested directly; the route is left with
 * nothing but wiring. A successful decision hands back the rows it was given,
 * so callers get them non-null without re-checking.
 */

export type BookingState = {
  status: string;
  scheduleId: number;
  bundleId: number | null;
  originalScheduleId: number | null;
};

export type ScheduleState = {
  id: number;
  classId: number;
  /** `YYYY-MM-DD`, so a bare string comparison orders it. */
  date: string;
  capacity: number;
  bookedCount: number;
  status: string;
};

export type DecisionFailure = {
  ok: false;
  error: string;
  httpStatus: 400 | 404;
};

function fail(error: string, httpStatus: 400 | 404): DecisionFailure {
  return { ok: false, error, httpStatus };
}

/* ------------------------------------------------------------------ cancel */

export type CancelDecision<B extends BookingState> =
  | DecisionFailure
  | {
      ok: true;
      booking: B;
      nextStatus: "cancelled";
      /** False when the seat was already handed back at release time. */
      decrementSchedule: boolean;
      /** Bundle to hand a credit back to, if the booking was bundle-funded. */
      restoreCreditToBundleId: number | null;
    };

export function decideCancel<B extends BookingState>(
  booking: B | null,
): CancelDecision<B> {
  if (!booking) return fail("Booking not found", 404);
  if (booking.status === "cancelled") {
    return fail("Booking is already cancelled", 400);
  }
  return {
    ok: true,
    booking,
    nextStatus: "cancelled",
    // A released booking has already given its seat back — decrementing again
    // would free a seat that was never taken.
    decrementSchedule: booking.status !== "released",
    restoreCreditToBundleId: booking.bundleId ?? null,
  };
}

/* ----------------------------------------------------------------- release */

/**
 * What releasing a seat does depends on how the booking was paid for.
 *
 * - `bundle-credit-returned`: a credit is fungible, so it goes straight back
 *   and the customer is self-sufficient again.
 * - `class-owed`: a card payment is attached to this class, so nothing can be
 *   returned automatically — the customer is recorded as owed a class instead.
 */
export type ReleaseEffect = "bundle-credit-returned" | "class-owed";

export type ReleaseEffectDescription = {
  effect: ReleaseEffect;
  /** Short label for the effect that will apply to this booking. */
  summary: string;
  /** What that effect will do, in Gabrielle's terms. */
  detail: string;
};

export function describeReleaseEffect(
  booking: Pick<BookingState, "bundleId">,
): ReleaseEffectDescription {
  if (booking.bundleId) {
    return {
      effect: "bundle-credit-returned",
      summary: "Bundle credit goes back",
      detail:
        "The seat is freed straight away and the credit returns to their bundle. They can book another class themselves — nothing further for you to do.",
    };
  }
  return {
    effect: "class-owed",
    summary: "Recorded as owed a class",
    detail:
      "The seat is freed straight away. Nothing is refunded in Stripe, so they are recorded as owed a class and stay on the owed list until you reschedule them onto a new date. They cannot re-book this same date themselves while they hold that claim.",
  };
}

export type ReleaseDecision<B extends BookingState> =
  | DecisionFailure
  | {
      ok: true;
      booking: B;
      effect: ReleaseEffect;
      /** Bundle releases settle immediately, so the booking is cancelled. */
      nextStatus: "cancelled" | "released";
      restoreCreditToBundleId: number | null;
    };

export function decideRelease<B extends BookingState>(
  booking: B | null,
): ReleaseDecision<B> {
  if (!booking) return fail("Booking not found", 404);
  if (booking.status === "cancelled") {
    return fail("Cannot release a cancelled booking", 400);
  }
  if (booking.status === "released") {
    return fail("Booking has already been released", 400);
  }
  if (booking.status !== "confirmed") {
    return fail("Only confirmed bookings can be released", 400);
  }

  const { effect } = describeReleaseEffect(booking);
  if (effect === "bundle-credit-returned") {
    return {
      ok: true,
      booking,
      effect,
      nextStatus: "cancelled",
      restoreCreditToBundleId: booking.bundleId,
    };
  }
  return {
    ok: true,
    booking,
    effect,
    nextStatus: "released",
    restoreCreditToBundleId: null,
  };
}

/* -------------------------------------------------------------- reschedule */

export type RescheduleDecision<
  B extends BookingState,
  S extends ScheduleState,
> =
  | DecisionFailure
  | {
      ok: true;
      booking: B;
      source: S;
      target: S;
      /** False for a released booking: its seat was returned at release. */
      decrementSource: boolean;
      /** A successful move clears any outstanding claim on a class. */
      nextStatus: "confirmed";
      originalScheduleId: number;
    };

/**
 * Whether this booking may be moved at all, decided before its schedules are
 * looked up so a doomed request costs no extra queries.
 */
export function checkReschedulable<B extends BookingState>(
  booking: B | null,
): DecisionFailure | { ok: true; booking: B } {
  if (!booking) return fail("Booking not found", 404);
  if (booking.status === "cancelled") {
    return fail("Cannot reschedule a cancelled booking", 400);
  }
  // Only a confirmed booking or a released one being settled may move; anything
  // else (a waitlist placeholder, say) holds no seat to move.
  if (booking.status !== "confirmed" && booking.status !== "released") {
    return fail("Cannot reschedule this booking", 400);
  }
  return { ok: true, booking };
}

/** A schedule considered as somewhere a booking could be moved to. */
export type RescheduleTarget = ScheduleState;

/**
 * The schedules a booking may be offered as new dates, soonest first.
 *
 * These are the refusals `decideReschedule` would give, applied ahead of time
 * so Gabrielle is never shown a date the server would reject. `today` is passed
 * in rather than read so the boundary is testable.
 */
export function selectRescheduleTargets<S extends RescheduleTarget>(
  schedules: S[],
  source: { scheduleId: number; classId: number },
  today: string,
): S[] {
  return schedules
    .filter(
      (s) =>
        s.classId === source.classId &&
        s.status !== "cancelled" &&
        s.date >= today &&
        s.id !== source.scheduleId &&
        s.bookedCount < s.capacity,
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function decideReschedule<
  B extends BookingState,
  S extends ScheduleState,
>(input: {
  booking: B | null;
  source: S | null;
  target: S | null;
  newScheduleId: number;
  /** Today as `YYYY-MM-DD`, passed in so the boundary is testable. */
  today: string;
}): RescheduleDecision<B, S> {
  const { source, target, newScheduleId, today } = input;

  const reschedulable = checkReschedulable(input.booking);
  if (!reschedulable.ok) return reschedulable;
  const booking = reschedulable.booking;

  if (!source) return fail("Source schedule not found", 404);
  if (!target) return fail("Target schedule not found", 404);
  if (target.classId !== source.classId) {
    return fail("Cannot reschedule to a different class", 400);
  }
  if (target.status === "cancelled") {
    return fail("Target class is cancelled", 400);
  }
  if (newScheduleId === booking.scheduleId) {
    return fail("Booking is already on that schedule", 400);
  }
  // A class that has been and gone is no use to the customer, and moving her
  // onto it would email her a date in the past. Today's class still counts: it
  // may not have started yet, and the sheet offers it.
  if (target.date < today) {
    return fail("Cannot reschedule to a class that has already happened", 400);
  }
  if (target.bookedCount >= target.capacity) {
    return fail("Target class is full", 400);
  }

  return {
    ok: true,
    booking,
    source,
    target,
    decrementSource: booking.status !== "released",
    nextStatus: "confirmed",
    originalScheduleId: booking.originalScheduleId ?? booking.scheduleId,
  };
}
