import { describe, expect, it } from "vitest";
import {
  type ClaimedOffer,
  decideCheckoutSeat,
  decideMakeOffer,
  decidePaidSeat,
  decideRedemptionSeat,
  decideWithdrawOffer,
  isHoldDuration,
  resolveOfferDeadline,
  summariseOfferOccupancy,
} from "@/lib/waitlist/offers";

const NOW = new Date("2026-06-15T09:00:00.000Z");

describe("summariseOfferOccupancy", () => {
  it("counts held seats as free, since nobody has paid for them", () => {
    // 8 seats, 8 taken, one of which is an offer nobody has taken up yet.
    const summary = summariseOfferOccupancy({
      capacity: 8,
      bookedCount: 8,
      offersOutstanding: 1,
    });
    expect(summary.freeSeats).toBe(1);
    expect(summary.offersOutstanding).toBe(1);
    expect(summary.seatsWithNobodyOnThem).toBe(0);
  });

  it("lets two offers run at once when two seats are free", () => {
    const none = summariseOfferOccupancy({
      capacity: 8,
      bookedCount: 6,
      offersOutstanding: 0,
    });
    expect(none.canOffer).toBe(true);
    expect(none.seatsWithNobodyOnThem).toBe(2);

    const one = summariseOfferOccupancy({
      capacity: 8,
      bookedCount: 7,
      offersOutstanding: 1,
    });
    expect(one.canOffer).toBe(true);
    expect(one.freeSeats).toBe(2);
    expect(one.seatsWithNobodyOnThem).toBe(1);

    const two = summariseOfferOccupancy({
      capacity: 8,
      bookedCount: 8,
      offersOutstanding: 2,
    });
    expect(two.canOffer).toBe(false);
    expect(two.freeSeats).toBe(2);
  });

  it("refuses a third offer against one free seat and one offer out", () => {
    const summary = summariseOfferOccupancy({
      capacity: 8,
      bookedCount: 8,
      offersOutstanding: 1,
    });
    expect(summary.canOffer).toBe(false);
  });

  it("never reports negative seats when a class is oversold", () => {
    const summary = summariseOfferOccupancy({
      capacity: 8,
      bookedCount: 9,
      offersOutstanding: 0,
    });
    expect(summary.freeSeats).toBe(0);
    expect(summary.seatsWithNobodyOnThem).toBe(0);
    expect(summary.canOffer).toBe(false);
  });
});

describe("resolveOfferDeadline", () => {
  const classStartsAt = new Date("2026-06-20T09:00:00.000Z");

  it("holds for 24 hours by default", () => {
    const decision = resolveOfferDeadline({
      hold: "24h",
      classStartsAt,
      now: NOW,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.expiresAt.toISOString()).toBe("2026-06-16T09:00:00.000Z");
    expect(decision.cappedByClassStart).toBe(false);
  });

  it("holds for 48 hours when asked", () => {
    const decision = resolveOfferDeadline({
      hold: "48h",
      classStartsAt,
      now: NOW,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.expiresAt.toISOString()).toBe("2026-06-17T09:00:00.000Z");
  });

  it("holds until the class starts when asked", () => {
    const decision = resolveOfferDeadline({
      hold: "class-start",
      classStartsAt,
      now: NOW,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.expiresAt.toISOString()).toBe(classStartsAt.toISOString());
    expect(decision.cappedByClassStart).toBe(false);
  });

  it("caps a 48-hour hold at a class that starts tomorrow", () => {
    const tomorrow = new Date("2026-06-16T18:00:00.000Z");
    const decision = resolveOfferDeadline({
      hold: "48h",
      classStartsAt: tomorrow,
      now: NOW,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.expiresAt.toISOString()).toBe(tomorrow.toISOString());
    expect(decision.cappedByClassStart).toBe(true);
  });

  it("refuses to offer a seat on a class that has already started", () => {
    const decision = resolveOfferDeadline({
      hold: "24h",
      classStartsAt: new Date("2026-06-15T08:59:59.000Z"),
      now: NOW,
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error).toBe("This class has already started");
    expect(decision.httpStatus).toBe(400);
  });

  it("recognises only the three hold durations on offer", () => {
    expect(isHoldDuration("24h")).toBe(true);
    expect(isHoldDuration("48h")).toBe(true);
    expect(isHoldDuration("class-start")).toBe(true);
    expect(isHoldDuration("72h")).toBe(false);
    expect(isHoldDuration(undefined)).toBe(false);
  });
});

const ENTRY = {
  id: 5,
  scheduleId: 42,
  customerEmail: "jane@example.com",
  offerToken: null,
  offerExpiresAt: null,
  heldBookingId: null,
};

const SCHEDULE = {
  id: 42,
  status: "full",
  capacity: 8,
  bookedCount: 7,
};

const CLASS_STARTS_AT = new Date("2026-06-20T09:00:00.000Z");

function makeOffer(overrides: Partial<Parameters<typeof decideMakeOffer>[0]>) {
  return decideMakeOffer({
    entry: ENTRY,
    heldBookingStatus: null,
    schedule: SCHEDULE,
    offersOutstanding: 0,
    hold: "24h",
    classStartsAt: CLASS_STARTS_AT,
    now: NOW,
    ...overrides,
  });
}

describe("decideMakeOffer", () => {
  it("offers a free seat and resolves the deadline", () => {
    const decision = makeOffer({});
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.expiresAt.toISOString()).toBe("2026-06-16T09:00:00.000Z");
    expect(decision.entry).toBe(ENTRY);
  });

  it("rejects a missing entry or schedule", () => {
    expect(makeOffer({ entry: null })).toMatchObject({
      ok: false,
      httpStatus: 404,
    });
    expect(makeOffer({ schedule: null })).toMatchObject({
      ok: false,
      httpStatus: 404,
    });
  });

  it("rejects an entry that belongs to a different class", () => {
    const decision = makeOffer({ entry: { ...ENTRY, scheduleId: 99 } });
    expect(decision).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("refuses to offer a seat on a cancelled class", () => {
    const decision = makeOffer({
      schedule: { ...SCHEDULE, status: "cancelled" },
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "This class is cancelled",
    });
  });

  it("refuses a second offer to someone who already has one outstanding", () => {
    const decision = makeOffer({
      entry: { ...ENTRY, heldBookingId: 77 },
      heldBookingStatus: "held",
    });
    expect(decision).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it("re-offers someone whose held seat has since been taken up elsewhere", () => {
    const decision = makeOffer({
      entry: { ...ENTRY, heldBookingId: 77 },
      heldBookingStatus: "cancelled",
    });
    expect(decision.ok).toBe(true);
  });

  it("refuses when every seat is taken", () => {
    const decision = makeOffer({
      schedule: { ...SCHEDULE, bookedCount: 8 },
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "There is no free seat to offer on this class",
    });
  });

  it("refuses when the only free seat already has an offer against it", () => {
    // Seven paid seats and one held: the held seat is somebody's already.
    const decision = makeOffer({
      schedule: { ...SCHEDULE, bookedCount: 8 },
      offersOutstanding: 1,
    });
    expect(decision).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("passes the deadline refusal straight through", () => {
    const decision = makeOffer({
      classStartsAt: new Date("2026-06-15T08:00:00.000Z"),
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "This class has already started",
    });
  });
});

describe("decideWithdrawOffer", () => {
  it("withdraws an outstanding offer and names the seat to free", () => {
    const decision = decideWithdrawOffer({
      entry: { ...ENTRY, heldBookingId: 77 },
      heldBookingStatus: "held",
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.heldBookingId).toBe(77);
  });

  it("rejects an entry with no offer outstanding", () => {
    expect(
      decideWithdrawOffer({ entry: ENTRY, heldBookingStatus: null }),
    ).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("rejects an offer whose seat has already been taken up", () => {
    expect(
      decideWithdrawOffer({
        entry: { ...ENTRY, heldBookingId: 77 },
        heldBookingStatus: "confirmed",
      }),
    ).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("rejects a missing entry", () => {
    expect(
      decideWithdrawOffer({ entry: null, heldBookingStatus: null }),
    ).toMatchObject({ ok: false, httpStatus: 404 });
  });
});

const TOKEN = "a-token";

const CLAIMED: ClaimedOffer = {
  ...ENTRY,
  customerName: "Jane Doe",
  offerToken: TOKEN,
  offerExpiresAt: new Date("2026-06-16T09:00:00.000Z"),
  heldBookingId: 77,
  heldBookingStatus: "held",
};

const REQUEST = { scheduleId: 42, customerEmail: "jane@example.com" };

function decideSeat(
  overrides: Partial<Parameters<typeof decideRedemptionSeat>[0]>,
) {
  return decideRedemptionSeat({
    token: TOKEN,
    offer: CLAIMED,
    request: REQUEST,
    existingBookings: [{ id: 77 }],
    now: NOW,
    ...overrides,
  });
}

describe("decideRedemptionSeat", () => {
  it("takes a new seat when no token is supplied and nothing is booked", () => {
    const decision = decideSeat({
      token: null,
      offer: null,
      existingBookings: [],
    });
    expect(decision).toEqual({ ok: true, kind: "new-seat" });
  });

  it("still refuses a duplicate booking when no token is supplied", () => {
    const decision = decideSeat({
      token: null,
      offer: null,
      existingBookings: [{ id: 77 }],
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "You already have a booking for this class",
      httpStatus: 409,
    });
  });

  it("converts the held seat a valid token is bound to", () => {
    const decision = decideSeat({});
    expect(decision).toEqual({
      ok: true,
      kind: "held-seat",
      bookingId: 77,
      waitlistEntryId: 5,
    });
  });

  it("matches the customer's email case-insensitively", () => {
    const decision = decideSeat({
      request: { ...REQUEST, customerEmail: " Jane@Example.com " },
    });
    expect(decision).toMatchObject({ ok: true, kind: "held-seat" });
  });

  it("rejects a token that matches no offer", () => {
    const decision = decideSeat({ offer: null, existingBookings: [] });
    expect(decision).toMatchObject({
      ok: false,
      error: "This offer is no longer available",
      httpStatus: 404,
    });
  });

  it("rejects an expired offer rather than bypassing the duplicate check", () => {
    const decision = decideSeat({
      offer: {
        ...CLAIMED,
        offerExpiresAt: new Date("2026-06-15T08:59:59.000Z"),
      },
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "This offer has expired",
      httpStatus: 410,
    });
  });

  it("rejects an offer whose deadline is missing", () => {
    const decision = decideSeat({
      offer: { ...CLAIMED, offerExpiresAt: null },
    });
    expect(decision).toMatchObject({ ok: false, httpStatus: 410 });
  });

  it("rejects a token used by the wrong customer", () => {
    const decision = decideSeat({
      request: { ...REQUEST, customerEmail: "someone@else.com" },
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "This offer was made to a different email address",
      httpStatus: 403,
    });
  });

  it("rejects a token used against the wrong class", () => {
    const decision = decideSeat({
      request: { ...REQUEST, scheduleId: 43 },
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "This offer is for a different class",
      httpStatus: 400,
    });
  });

  it("reports an offer that has already been taken up", () => {
    const decision = decideSeat({
      offer: { ...CLAIMED, heldBookingStatus: "confirmed" },
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "This offer has already been taken up",
      httpStatus: 409,
    });
  });

  it("rejects an entry that holds no seat at all", () => {
    const decision = decideSeat({
      offer: { ...CLAIMED, heldBookingId: null, heldBookingStatus: null },
    });
    expect(decision).toMatchObject({ ok: false, httpStatus: 404 });
  });

  it("rejects a token that does not match the offer it was read against", () => {
    const decision = decideSeat({ token: "some-other-token" });
    expect(decision).toMatchObject({ ok: false, httpStatus: 404 });
  });

  it("still refuses when the customer has another active booking besides the held seat", () => {
    const decision = decideSeat({
      existingBookings: [{ id: 77 }, { id: 88 }],
    });
    expect(decision).toMatchObject({
      ok: false,
      error: "You already have a booking for this class",
      httpStatus: 409,
    });
  });
});

/** A class filled to the brim by the held seat the recipient is being offered. */
const FULL_BY_THE_HELD_SEAT = { status: "open", capacity: 8, bookedCount: 8 };

function decideCheckout(
  overrides: Partial<Parameters<typeof decideCheckoutSeat>[0]>,
) {
  return decideCheckoutSeat({
    token: TOKEN,
    offer: CLAIMED,
    request: REQUEST,
    existingBookings: [{ id: 77 }],
    schedule: FULL_BY_THE_HELD_SEAT,
    now: NOW,
    ...overrides,
  });
}

describe("decideCheckoutSeat", () => {
  it("lets a valid token past both the full class and its own held seat", () => {
    // Neither refusal is a real one: the seat that fills the class, and the
    // booking that looks like a duplicate, are the same held seat.
    expect(decideCheckout({})).toEqual({
      ok: true,
      kind: "held-seat",
      bookingId: 77,
      waitlistEntryId: 5,
    });
  });

  it("lets a valid token past a class Gabrielle has flagged as full by hand", () => {
    expect(
      decideCheckout({
        schedule: { status: "full", capacity: 8, bookedCount: 8 },
      }),
    ).toMatchObject({ ok: true, kind: "held-seat" });
  });

  it("refuses a cancelled class to the offer recipient as well", () => {
    expect(
      decideCheckout({
        schedule: { status: "cancelled", capacity: 8, bookedCount: 8 },
      }),
    ).toMatchObject({
      ok: false,
      error: "Class is not available",
      httpStatus: 400,
    });
  });

  it("leaves ordinary public booking exactly as it was", () => {
    const noToken = {
      token: null,
      offer: null,
      existingBookings: [],
    };

    expect(
      decideCheckout({ ...noToken, schedule: FULL_BY_THE_HELD_SEAT }),
    ).toMatchObject({ ok: false, error: "Class is full", httpStatus: 400 });

    expect(
      decideCheckout({
        ...noToken,
        schedule: { status: "full", capacity: 8, bookedCount: 2 },
      }),
    ).toMatchObject({ ok: false, error: "Class is not available" });

    expect(
      decideCheckout({
        ...noToken,
        existingBookings: [{ id: 88 }],
        schedule: { status: "open", capacity: 8, bookedCount: 2 },
      }),
    ).toMatchObject({
      ok: false,
      error: "You already have a booking for this class",
      httpStatus: 409,
    });

    expect(
      decideCheckout({
        ...noToken,
        schedule: { status: "open", capacity: 8, bookedCount: 2 },
      }),
    ).toEqual({ ok: true, kind: "new-seat" });
  });

  // Every way a token can fail to qualify. Each one has to land back on the
  // ordinary refusals: a bypass any wider than one held seat would be a hole in
  // public booking, since a full class refuses nobody holding a token.
  it("refuses a token that matches no offer", () => {
    expect(decideCheckout({ offer: null })).toMatchObject({
      ok: false,
      error: "This offer is no longer available",
      httpStatus: 404,
    });
  });

  it("refuses a token that does not match the offer it was read against", () => {
    expect(decideCheckout({ token: "some-other-token" })).toMatchObject({
      ok: false,
      httpStatus: 404,
    });
  });

  it("refuses an entry that holds no seat at all", () => {
    expect(
      decideCheckout({
        offer: { ...CLAIMED, heldBookingId: null, heldBookingStatus: null },
      }),
    ).toMatchObject({ ok: false, httpStatus: 404 });
  });

  it("refuses a seat that has already been taken up", () => {
    expect(
      decideCheckout({ offer: { ...CLAIMED, heldBookingStatus: "confirmed" } }),
    ).toMatchObject({
      ok: false,
      error: "This offer has already been taken up",
      httpStatus: 409,
    });
  });

  it("refuses an expired offer", () => {
    expect(
      decideCheckout({
        offer: {
          ...CLAIMED,
          offerExpiresAt: new Date("2026-06-15T08:59:59.000Z"),
        },
      }),
    ).toMatchObject({
      ok: false,
      error: "This offer has expired",
      httpStatus: 410,
    });
  });

  it("refuses an offer whose deadline is missing", () => {
    expect(
      decideCheckout({ offer: { ...CLAIMED, offerExpiresAt: null } }),
    ).toMatchObject({ ok: false, httpStatus: 410 });
  });

  it("refuses a token presented by the wrong customer", () => {
    expect(
      decideCheckout({
        request: { ...REQUEST, customerEmail: "someone@else.com" },
      }),
    ).toMatchObject({
      ok: false,
      error: "This offer was made to a different email address",
      httpStatus: 403,
    });
  });

  it("refuses a token presented against the wrong class", () => {
    expect(
      decideCheckout({ request: { ...REQUEST, scheduleId: 43 } }),
    ).toMatchObject({
      ok: false,
      error: "This offer is for a different class",
      httpStatus: 400,
    });
  });

  it("matches the customer's email case-insensitively", () => {
    expect(
      decideCheckout({
        request: { ...REQUEST, customerEmail: " Jane@Example.com " },
      }),
    ).toMatchObject({ ok: true, kind: "held-seat" });
  });

  it("still refuses when the customer has another active booking besides the held seat", () => {
    expect(
      decideCheckout({ existingBookings: [{ id: 77 }, { id: 88 }] }),
    ).toMatchObject({
      ok: false,
      error: "You already have a booking for this class",
      httpStatus: 409,
    });
  });
});

function decidePaid(overrides: Partial<Parameters<typeof decidePaidSeat>[0]>) {
  return decidePaidSeat({
    token: TOKEN,
    heldBookingId: 77,
    offer: CLAIMED,
    request: REQUEST,
    existingBookings: [{ id: 77, status: "held" }],
    ...overrides,
  });
}

describe("decidePaidSeat", () => {
  it("converts the held seat the payment was started against", () => {
    expect(decidePaid({})).toEqual({
      kind: "convert-held-seat",
      bookingId: 77,
      waitlistEntryId: 5,
    });
  });

  it("honours a payment that landed after the deadline passed", () => {
    // The deadline governs whether a payment may be started, not whether one
    // already taken is honoured — the customer has been charged.
    expect(
      decidePaid({
        offer: {
          ...CLAIMED,
          offerExpiresAt: new Date("2026-06-15T08:59:59.000Z"),
        },
      }),
    ).toMatchObject({ kind: "convert-held-seat", bookingId: 77 });
  });

  it("writes nothing further when the held seat is already confirmed", () => {
    // The second delivery of the same event: the first one converted the seat.
    expect(
      decidePaid({
        offer: { ...CLAIMED, heldBookingStatus: "confirmed" },
        existingBookings: [{ id: 77, status: "confirmed" }],
      }),
    ).toEqual({ kind: "already-booked" });
  });

  it("writes nothing further when a credit got there first", () => {
    // Redeeming removes the entry, so the token now matches nothing.
    expect(
      decidePaid({
        offer: null,
        existingBookings: [{ id: 77, status: "confirmed" }],
      }),
    ).toEqual({ kind: "already-booked" });
  });

  it("books the customer anyway when the hold was withdrawn under them", () => {
    // Withdrawing deleted the held booking and freed the seat. They have paid,
    // so a seat they get — over capacity if it comes to that.
    expect(decidePaid({ offer: null, existingBookings: [] })).toEqual({
      kind: "new-booking",
    });
  });

  it("does not convert a seat the token is no longer bound to", () => {
    expect(
      decidePaid({
        heldBookingId: 77,
        offer: { ...CLAIMED, heldBookingId: 99 },
        existingBookings: [],
      }),
    ).toEqual({ kind: "new-booking" });
  });

  it("does not convert someone else's held seat", () => {
    expect(
      decidePaid({
        request: { ...REQUEST, customerEmail: "someone@else.com" },
        existingBookings: [],
      }),
    ).toEqual({ kind: "new-booking" });

    expect(
      decidePaid({
        request: { ...REQUEST, scheduleId: 43 },
        existingBookings: [],
      }),
    ).toEqual({ kind: "new-booking" });
  });

  it("decides an ordinary card booking exactly as it did before", () => {
    const noOffer = { token: null, heldBookingId: null, offer: null };

    expect(decidePaid({ ...noOffer, existingBookings: [] })).toEqual({
      kind: "new-booking",
    });

    expect(
      decidePaid({
        ...noOffer,
        existingBookings: [{ id: 88, status: "confirmed" }],
      }),
    ).toEqual({ kind: "already-booked" });
  });
});
