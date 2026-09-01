import { describe, expect, it } from "vitest";
import {
  type BookingState,
  decideCancel,
  decideRelease,
  decideReschedule,
  describeReleaseEffect,
  type RescheduleTarget,
  type ScheduleState,
  selectRescheduleTargets,
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
      booking: BUNDLE_BOOKING,
      effect: "bundle-credit-returned",
      nextStatus: "cancelled",
      restoreCreditToBundleId: 7,
    });
  });

  it("moves a card booking to released, freeing the seat and refunding nothing", () => {
    const decision = decideRelease(CARD_BOOKING);
    expect(decision).toEqual({
      ok: true,
      booking: CARD_BOOKING,
      effect: "class-owed",
      nextStatus: "released",
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
      booking: BUNDLE_BOOKING,
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
      booking: CARD_BOOKING,
      source: SOURCE,
      target: TARGET,
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

describe("selectRescheduleTargets", () => {
  const TODAY = "2026-06-01";
  const SOURCE_REF = { scheduleId: 10, classId: 3 };

  function schedule(overrides: Partial<RescheduleTarget>): RescheduleTarget {
    return {
      id: 20,
      classId: 3,
      date: "2026-06-10",
      capacity: 8,
      bookedCount: 2,
      status: "open",
      ...overrides,
    };
  }

  it("offers a future date on the same class with room left", () => {
    const target = schedule({});
    expect(selectRescheduleTargets([target], SOURCE_REF, TODAY)).toEqual([
      target,
    ]);
  });

  it("never offers what the server would refuse", () => {
    const refused = [
      schedule({ id: 21, classId: 4 }),
      schedule({ id: 22, status: "cancelled" }),
      schedule({ id: 10 }),
      schedule({ id: 23, bookedCount: 8 }),
      schedule({ id: 24, bookedCount: 9 }),
    ];
    expect(selectRescheduleTargets(refused, SOURCE_REF, TODAY)).toEqual([]);
  });

  it("offers today's class but not yesterday's", () => {
    const today = schedule({ id: 25, date: TODAY });
    const yesterday = schedule({ id: 26, date: "2026-05-31" });
    expect(
      selectRescheduleTargets([today, yesterday], SOURCE_REF, TODAY),
    ).toEqual([today]);
  });

  it("puts the soonest date first whatever order they arrive in", () => {
    const later = schedule({ id: 27, date: "2026-07-01" });
    const sooner = schedule({ id: 28, date: "2026-06-05" });
    expect(
      selectRescheduleTargets([later, sooner], SOURCE_REF, TODAY).map(
        (s) => s.id,
      ),
    ).toEqual([28, 27]);
  });

  it("leaves the caller's array alone", () => {
    const input = [
      schedule({ id: 29, date: "2026-07-01" }),
      schedule({ id: 30, date: "2026-06-05" }),
    ];
    selectRescheduleTargets(input, SOURCE_REF, TODAY);
    expect(input.map((s) => s.id)).toEqual([29, 30]);
  });
});
