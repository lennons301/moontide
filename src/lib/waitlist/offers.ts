/**
 * Pure decision seam for seat offers made to people on a waiting list.
 *
 * An offer gives one named person a time-limited exclusive claim on one seat.
 * The seat is genuinely held — a `held` booking occupies capacity exactly like
 * a paid one — so the class reads as full to everyone else through the
 * mechanism it always used, with no new visibility rules.
 *
 * Everything here takes rows that have already been read and returns the
 * decision to apply. No database, no framework: the rules are testable on their
 * own and the routes are left with wiring.
 */

import { normaliseEmail } from "@/lib/customers/email";

export type OfferFailure = {
  ok: false;
  error: string;
  httpStatus: 400 | 403 | 404 | 409 | 410;
};

function fail(
  error: string,
  httpStatus: OfferFailure["httpStatus"],
): OfferFailure {
  return { ok: false, error, httpStatus };
}

/** Normalised for comparison — an offer is bound to an address, not a login. */
function sameEmail(a: string, b: string): boolean {
  return normaliseEmail(a) === normaliseEmail(b);
}

/* ------------------------------------------------------------- occupancy */

export type OfferOccupancy = {
  capacity: number;
  /** Every booking holding a seat, held offers included. */
  bookedCount: number;
  /** Held seats within `bookedCount` — offers nobody has taken up yet. */
  offersOutstanding: number;
};

export type OfferOccupancySummary = {
  /** Seats nobody has paid for: the unfilled ones plus the held ones. */
  freeSeats: number;
  offersOutstanding: number;
  /** Free seats with nobody working on them — no offer out against them. */
  seatsWithNobodyOnThem: number;
  /**
   * True while a seat can still be held. Offers can never outnumber free seats
   * because making one takes a seat: with two free she can run two at once,
   * and with one seat and one offer out there is nothing left to hold.
   */
  canOffer: boolean;
};

export function summariseOfferOccupancy(
  occupancy: OfferOccupancy,
): OfferOccupancySummary {
  const { capacity, bookedCount, offersOutstanding } = occupancy;
  const unheldFreeSeats = Math.max(0, capacity - bookedCount);
  return {
    freeSeats: unheldFreeSeats + offersOutstanding,
    offersOutstanding,
    seatsWithNobodyOnThem: unheldFreeSeats,
    canOffer: unheldFreeSeats > 0,
  };
}

/* -------------------------------------------------------------- deadline */

/** How long Gabrielle wants to hold the seat for. */
export type HoldDuration = "24h" | "48h" | "class-start";

export const HOLD_DURATIONS: HoldDuration[] = ["24h", "48h", "class-start"];

export function isHoldDuration(value: unknown): value is HoldDuration {
  return HOLD_DURATIONS.includes(value as HoldDuration);
}

/**
 * Whether a deadline has passed.
 *
 * The single reading of "expired", so nothing depends on a job having noticed
 * first: an offer past its deadline is expired wherever it is read, and the
 * settling job only catches up with what every reader already knows. A missing
 * deadline is lapsed — it is holding a seat for nobody, until when?
 */
export function hasOfferLapsed(
  expiresAt: Date | null | undefined,
  now: Date,
): boolean {
  return !expiresAt || expiresAt.getTime() <= now.getTime();
}

export type DeadlineDecision =
  | { ok: true; expiresAt: Date; cappedByClassStart: boolean }
  | OfferFailure;

/**
 * Resolve when the hold lapses: always the earlier of Gabrielle's choice and
 * the class starting. A 48-hour hold on a class tomorrow expires when the class
 * begins, because there is nothing left to hold afterwards.
 */
export function resolveOfferDeadline(input: {
  hold: HoldDuration;
  classStartsAt: Date;
  now: Date;
}): DeadlineDecision {
  const { hold, classStartsAt, now } = input;

  if (classStartsAt.getTime() <= now.getTime()) {
    return fail("This class has already started", 400);
  }

  const hours = hold === "24h" ? 24 : hold === "48h" ? 48 : null;
  const chosen =
    hours === null
      ? classStartsAt
      : new Date(now.getTime() + hours * 60 * 60 * 1000);
  const cappedByClassStart = chosen.getTime() > classStartsAt.getTime();

  return {
    ok: true,
    expiresAt: cappedByClassStart ? classStartsAt : chosen,
    cappedByClassStart,
  };
}

/* ----------------------------------------------------------- making one */

export type WaitlistEntryState = {
  id: number;
  scheduleId: number;
  customerEmail: string;
  offerToken: string | null;
  offerExpiresAt: Date | null;
  heldBookingId: number | null;
};

export type ScheduleOfferState = {
  id: number;
  status: string;
  capacity: number;
  bookedCount: number;
};

/** Whether the entry's held seat is still being held for them. */
function hasOutstandingOffer(
  entry: WaitlistEntryState,
  heldBookingStatus: string | null,
): boolean {
  return entry.heldBookingId !== null && heldBookingStatus === "held";
}

export type MakeOfferDecision<E extends WaitlistEntryState> =
  | { ok: true; entry: E; expiresAt: Date }
  | OfferFailure;

export function decideMakeOffer<E extends WaitlistEntryState>(input: {
  entry: E | null;
  /** Status of the booking the entry already holds, if it holds one. */
  heldBookingStatus: string | null;
  schedule: ScheduleOfferState | null;
  offersOutstanding: number;
  hold: HoldDuration;
  classStartsAt: Date;
  now: Date;
}): MakeOfferDecision<E> {
  const { entry, heldBookingStatus, schedule, offersOutstanding } = input;

  if (!entry) return fail("Waiting-list entry not found", 404);
  if (!schedule) return fail("Schedule not found", 404);
  if (entry.scheduleId !== schedule.id) {
    return fail("That person is not on this class's waiting list", 400);
  }
  if (schedule.status === "cancelled") {
    return fail("This class is cancelled", 400);
  }
  if (hasOutstandingOffer(entry, heldBookingStatus)) {
    // Re-offering overwrites the offer on the entry, which would strand the
    // seat the previous offer is holding. Withdrawing first is the explicit
    // way to free it, and the system never guesses which she meant.
    return fail(
      "This person already has an offer outstanding — withdraw it first",
      409,
    );
  }

  const occupancy = summariseOfferOccupancy({
    capacity: schedule.capacity,
    bookedCount: schedule.bookedCount,
    offersOutstanding,
  });
  if (!occupancy.canOffer) {
    return fail("There is no free seat to offer on this class", 400);
  }

  const deadline = resolveOfferDeadline({
    hold: input.hold,
    classStartsAt: input.classStartsAt,
    now: input.now,
  });
  if (!deadline.ok) return deadline;

  return { ok: true, entry, expiresAt: deadline.expiresAt };
}

/* ----------------------------------------------------------- withdrawing */

export type WithdrawOfferDecision<E extends WaitlistEntryState> =
  | { ok: true; entry: E; heldBookingId: number }
  | OfferFailure;

/**
 * Withdrawing frees the seat and leaves the person on the waiting list. Taking
 * them off is the separate remove action, and nothing is sent to them: she has
 * already replied herself, and a system message would contradict her.
 */
export function decideWithdrawOffer<E extends WaitlistEntryState>(input: {
  entry: E | null;
  heldBookingStatus: string | null;
}): WithdrawOfferDecision<E> {
  const { entry, heldBookingStatus } = input;

  if (!entry) return fail("Waiting-list entry not found", 404);
  if (!hasOutstandingOffer(entry, heldBookingStatus)) {
    return fail("There is no offer outstanding for this person", 400);
  }

  return {
    ok: true,
    entry,
    heldBookingId: entry.heldBookingId as number,
  };
}

/* ------------------------------------------------------------ taking it up */

/** The offer a redemption claims, read back by its token. */
export type ClaimedOffer = WaitlistEntryState & {
  customerName: string;
  /** Status of the held booking; null when the entry holds no seat. */
  heldBookingStatus: string | null;
};

export type SeatDecision =
  | { ok: true; kind: "new-seat" }
  | {
      ok: true;
      kind: "held-seat";
      /** The booking to convert in place — occupancy must not move. */
      bookingId: number;
      /** Removed on acceptance, taking the offer with it. */
      waitlistEntryId: number;
    }
  | OfferFailure;

export type OfferBinding =
  | { ok: true; bookingId: number; waitlistEntryId: number }
  | OfferFailure;

/**
 * Decide whether a token entitles its bearer to the seat it names.
 *
 * This is the whole bypass. A held seat is a non-cancelled booking for the same
 * person and the same class, so every check that treats such a booking as a
 * duplicate — or counts it towards a full class — would otherwise refuse the
 * very person the seat is being held for. The bypass is narrow on purpose: it
 * covers only the one booking a valid, unexpired token is bound to, for the
 * customer and class it names. Any other active booking still blocks.
 */
function bindOffer(input: {
  token: string;
  offer: ClaimedOffer | null;
  request: { scheduleId: number; customerEmail: string };
  existingBookings: { id: number }[];
  now: Date;
}): OfferBinding {
  const { token, offer, request, existingBookings, now } = input;

  if (!offer || offer.offerToken !== token) {
    return fail("This offer is no longer available", 404);
  }
  if (offer.heldBookingId === null || offer.heldBookingStatus === null) {
    return fail("This offer is no longer available", 404);
  }
  if (offer.heldBookingStatus !== "held") {
    return fail("This offer has already been taken up", 409);
  }
  if (offer.scheduleId !== request.scheduleId) {
    return fail("This offer is for a different class", 400);
  }
  if (!sameEmail(offer.customerEmail, request.customerEmail)) {
    return fail("This offer was made to a different email address", 403);
  }
  if (hasOfferLapsed(offer.offerExpiresAt, now)) {
    return fail("This offer has expired", 410);
  }

  const otherBooking = existingBookings.find(
    (booking) => booking.id !== offer.heldBookingId,
  );
  if (otherBooking) {
    return fail("You already have a booking for this class", 409);
  }

  return {
    ok: true,
    bookingId: offer.heldBookingId,
    waitlistEntryId: offer.id,
  };
}

/**
 * Decide which seat a bundle redemption is for, and whether the existing
 * duplicate-booking check applies to it.
 *
 * A request with no token is decided exactly as it was before.
 */
export function decideRedemptionSeat(input: {
  token: string | null | undefined;
  /** Entry found by that token, or null when the token matched nothing. */
  offer: ClaimedOffer | null;
  request: { scheduleId: number; customerEmail: string };
  /** Non-cancelled bookings already held by this customer for this class. */
  existingBookings: { id: number }[];
  now: Date;
}): SeatDecision {
  const { token, existingBookings } = input;

  if (!token) {
    if (existingBookings.length > 0) {
      return fail("You already have a booking for this class", 409);
    }
    return { ok: true, kind: "new-seat" };
  }

  const bound = bindOffer({ ...input, token });
  if (!bound.ok) return bound;

  return {
    ok: true,
    kind: "held-seat",
    bookingId: bound.bookingId,
    waitlistEntryId: bound.waitlistEntryId,
  };
}

/* --------------------------------------------------- paying for a held seat */

/**
 * Decide whether a card checkout may start, and which seat it is for.
 *
 * The refusals guarding ordinary public booking are triggered by an offer
 * recipient's own held seat: they are told they already have a booking, and
 * told the class is full — full because the seat being kept for them is what
 * filled it, whether that shows in the count or in the flag Gabrielle set by
 * hand. A valid token bypasses those, leaving a cancelled class refused to
 * everyone. That is the same posture the credit path takes for the same seat,
 * so a recipient meets one answer whichever way they pay.
 */
export function decideCheckoutSeat(input: {
  token: string | null | undefined;
  offer: ClaimedOffer | null;
  request: { scheduleId: number; customerEmail: string };
  /** Non-cancelled bookings already held by this customer for this class. */
  existingBookings: { id: number }[];
  schedule: { status: string; capacity: number; bookedCount: number };
  now: Date;
}): SeatDecision {
  const { token, existingBookings, schedule } = input;

  if (schedule.status === "cancelled") {
    return fail("Class is not available", 400);
  }

  if (token) {
    const bound = bindOffer({ ...input, token });
    if (!bound.ok) return bound;

    return {
      ok: true,
      kind: "held-seat",
      bookingId: bound.bookingId,
      waitlistEntryId: bound.waitlistEntryId,
    };
  }

  // Wording and order preserved from before the bypass existed.
  if (schedule.status !== "open") {
    return fail("Class is not available", 400);
  }
  if (schedule.bookedCount >= schedule.capacity) {
    return fail("Class is full", 400);
  }
  if (existingBookings.length > 0) {
    return fail("You already have a booking for this class", 409);
  }
  return { ok: true, kind: "new-seat" };
}

/**
 * What to do with a seat once the money is in.
 *
 * There is no refusal here, by design: the customer has been charged, so
 * "no seat for you" is never an answer. Capacity is not consulted — the paid
 * path takes the seat and raises a full class's capacity to admit it, reporting
 * the raise (see `forceClaimSeat`).
 */
export type PaidSeatDecision =
  | {
      kind: "convert-held-seat";
      /** Converted in place: occupancy already counts this seat. */
      bookingId: number;
      /** Removed on acceptance, taking the offer with it. */
      waitlistEntryId: number;
    }
  | { kind: "new-booking" }
  | {
      /**
       * A booking for this customer and class is already there — a repeated
       * delivery of the same payment, or an acceptance that landed by another
       * route. Nothing further is written and nothing further is sent.
       */
      kind: "already-booked";
    };

/**
 * Decide what a confirmed payment does to the customer's seat.
 *
 * Without the held-seat case this reads a seat being held for the payer as a
 * duplicate delivery and returns early: no booking, no confirmation, seat still
 * held, money kept. So the offer the checkout was started from is carried
 * through the payment and converted here.
 */
export function decidePaidSeat(input: {
  /** The offer token the checkout was started with, if any. */
  token: string | null | undefined;
  /** The held booking that checkout bound the token to, if any. */
  heldBookingId: number | null;
  /** Entry found by that token now, or null when the token matched nothing. */
  offer: ClaimedOffer | null;
  request: { scheduleId: number; customerEmail: string };
  /** Non-cancelled bookings already held by this customer for this class. */
  existingBookings: { id: number }[];
}): PaidSeatDecision {
  const { token, heldBookingId, offer, request, existingBookings } = input;

  const stillHeldForThem =
    token !== null &&
    token !== undefined &&
    heldBookingId !== null &&
    offer !== null &&
    offer.offerToken === token &&
    offer.heldBookingId === heldBookingId &&
    offer.heldBookingStatus === "held" &&
    offer.scheduleId === request.scheduleId &&
    sameEmail(offer.customerEmail, request.customerEmail);

  // The deadline is deliberately not checked: it governs whether a payment may
  // be started, not whether one already taken is honoured.
  if (stillHeldForThem) {
    return {
      kind: "convert-held-seat",
      bookingId: heldBookingId,
      waitlistEntryId: offer.id,
    };
  }

  // The hold is gone — withdrawn, re-offered, or already taken up. Whatever it
  // was, this payment still has to end in a seat unless one is already there.
  if (existingBookings.length > 0) return { kind: "already-booked" };

  return { kind: "new-booking" };
}
