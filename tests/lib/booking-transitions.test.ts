import { describe, expect, it } from "vitest";
import {
  type BookingState,
  decideCancel,
  decideRelease,
  decideReschedule,
  describeReleaseEffect,
  type ScheduleState,
} from "@/lib/bookings/transitions";

const CARD_BOOKING: BookingState = {
  status: "confirmed",
  scheduleId: 10,
  bundleId: null,
  originalScheduleId: null,
};

const BUNDLE_BOOKING: BookingState = { ...CARD_BOOKING, bundleId: 7 };

const SOURCE: ScheduleState = {
  id: 10,
  classId: 100,
  capacity: 8,
  bookedCount: 3,
  status: "open",
};

const TARGET: ScheduleState = { ...SOURCE, id: 20, bookedCount: 2 };

describe("describeReleaseEffect", () => {
  it("states that a bundle-funded booking gets its credit back", () => {
    const described = describeReleaseEffect(BUNDLE_BOOKING);
    expect(described.effect).toBe("bundle-credit-returned");
    expect(described.summary).toMatch(/credit/i);
    expect(described.detail).toMatch(/credit returns to their bundle/i);
  });

  it("states that a card-funded booking is recorded as owed a class", () => {
    const described = describeReleaseEffect(CARD_BOOKING);
    expect(described.effect).toBe("class-owed");
    expect(described.summary).toMatch(/owed a class/i);
    expect(described.detail).toMatch(/nothing is refunded/i);
    // The customer being locked out of re-booking this same date is intended,
    // so the copy has to say so.
    expect(described.detail).toMatch(/cannot re-book this same date/i);
  });
});

describe("decideRelease", () => {
  it("rejects a missing booking", () => {
    const decision = decideRelease(null);
    expect(decision).toMatchObject({
      ok: false,
      error: "Booking not found",
      httpStatus: 404,
    });
  });

  it("rejects a cancelled booking", () => {
    const decision = decideRelease({ ...CARD_BOOKING, status: "cancelled" });
    expect(decision).toMatchObject({
      ok: false,
      error: "Cannot release a cancelled booking",
      httpStatus: 400,
    });
  });

  it("rejects a booking that is already released", () => {
    const decision = decideRelease({ ...CARD_BOOKING, status: "released" });
    expect(decision).toMatchObject({
      ok: false,
      error: "Booking has already been released",
      httpStatus: 400,
    });
  });

  it("rejects a waitlisted booking, which holds no seat to give back", () => {
    const decision = decideRelease({ ...CARD_BOOKING, status: "waitlisted" });
    expect(decision).toMatchObject({
      ok: false,
      error: "Only confirmed bookings can be released",
      httpStatus: 400,
    });
  });

  it("cancels a bundle booking, frees the seat and returns the credit", () => {
    const decision = decideRelease(BUNDLE_BOOKING);
    expect(decision).toEqual({
      ok: true,
      effect: "bundle-credit-returned",
      nextStatus: "cancelled",
      decrementSchedule: true,
      restoreCreditToBundleId: 7,
    });
  });

  it("moves a card booking to released, freeing the seat and refunding nothing", () => {
    const decision = decideRelease(CARD_BOOKING);
    expect(decision).toEqual({
      ok: true,
      effect: "class-owed",
      nextStatus: "released",
      decrementSchedule: true,
      restoreCreditToBundleId: null,
    });
  });
});

describe("decideCancel", () => {
  it("rejects a missing booking", () => {
    expect(decideCancel(null)).toMatchObject({
      ok: false,
      error: "Booking not found",
      httpStatus: 404,
    });
  });

  it("rejects an already cancelled booking", () => {
    expect(
      decideCancel({ ...CARD_BOOKING, status: "cancelled" }),
    ).toMatchObject({
      ok: false,
      error: "Booking is already cancelled",
      httpStatus: 400,
    });
  });

  it("frees the seat and returns a bundle credit for a confirmed booking", () => {
    expect(decideCancel(BUNDLE_BOOKING)).toEqual({
      ok: true,
      nextStatus: "cancelled",
      decrementSchedule: true,
      restoreCreditToBundleId: 7,
    });
  });

  it("does not free the seat again when cancelling a released booking", () => {
    const decision = decideCancel({ ...CARD_BOOKING, status: "released" });
    expect(decision).toMatchObject({ ok: true, decrementSchedule: false });
  });
});

describe("decideReschedule", () => {
  const base = { source: SOURCE, target: TARGET, newScheduleId: 20 };

  it("rejects a missing booking", () => {
    expect(decideReschedule({ ...base, booking: null })).toMatchObject({
      ok: false,
      error: "Booking not found",
      httpStatus: 404,
    });
  });

  it("rejects a cancelled booking", () => {
    expect(
      decideReschedule({
        ...base,
        booking: { ...CARD_BOOKING, status: "cancelled" },
      }),
    ).toMatchObject({
      ok: false,
      error: "Cannot reschedule a cancelled booking",
      httpStatus: 400,
    });
  });

  it("rejects a waitlisted booking rather than letting it through", () => {
    expect(
      decideReschedule({
        ...base,
        booking: { ...CARD_BOOKING, status: "waitlisted" },
      }),
    ).toMatchObject({
      ok: false,
      error: "Cannot reschedule this booking",
      httpStatus: 400,
    });
  });

  it("rejects a missing source or target schedule", () => {
    expect(
      decideReschedule({ ...base, booking: CARD_BOOKING, source: null }),
    ).toMatchObject({ error: "Source schedule not found", httpStatus: 404 });
    expect(
      decideReschedule({ ...base, booking: CARD_BOOKING, target: null }),
    ).toMatchObject({ error: "Target schedule not found", httpStatus: 404 });
  });

  it("rejects a target belonging to another class", () => {
    expect(
      decideReschedule({
        ...base,
        booking: CARD_BOOKING,
        target: { ...TARGET, classId: 999 },
      }),
    ).toMatchObject({ error: "Cannot reschedule to a different class" });
  });

  it("rejects a cancelled, identical or full target", () => {
    expect(
      decideReschedule({
        ...base,
        booking: CARD_BOOKING,
        target: { ...TARGET, status: "cancelled" },
      }),
    ).toMatchObject({ error: "Target class is cancelled" });
    expect(
      decideReschedule({
        ...base,
        booking: CARD_BOOKING,
        target: SOURCE,
        newScheduleId: 10,
      }),
    ).toMatchObject({ error: "Booking is already on that schedule" });
    expect(
      decideReschedule({
        ...base,
        booking: CARD_BOOKING,
        target: { ...TARGET, bookedCount: 8, capacity: 8 },
      }),
    ).toMatchObject({ error: "Target class is full" });
  });

  it("moves a confirmed booking, decrementing the source", () => {
    expect(decideReschedule({ ...base, booking: CARD_BOOKING })).toEqual({
      ok: true,
      targetScheduleId: 20,
      decrementSource: true,
      nextStatus: "confirmed",
      originalScheduleId: 10,
    });
  });

  it("keeps the first originalScheduleId on a second move", () => {
    expect(
      decideReschedule({
        ...base,
        booking: { ...CARD_BOOKING, originalScheduleId: 5 },
      }),
    ).toMatchObject({ originalScheduleId: 5 });
  });

  it("does not decrement the source for a released booking, and confirms it", () => {
    expect(
      decideReschedule({
        ...base,
        booking: { ...CARD_BOOKING, status: "released" },
      }),
    ).toMatchObject({
      ok: true,
      decrementSource: false,
      nextStatus: "confirmed",
    });
  });
});
