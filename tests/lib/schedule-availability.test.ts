import { describe, expect, it } from "vitest";
import {
  BOOKABLE_SCHEDULE_STATUS,
  canTakeBooking,
  isOpenToBookings,
  isScheduleFull,
  SCHEDULE_STATUSES,
  seatsRemaining,
} from "@/lib/schedules/availability";

/**
 * The one definition of "can this schedule take a booking", which every write
 * path and every read of availability now asks. The write paths are held to it
 * by `claimSeat`, whose SQL guard says the same thing — see
 * `tests/integration/schedule-occupancy.test.ts`, since no mock can refuse a
 * write.
 */

describe("the statuses a schedule can have", () => {
  it("has no derived state in it, and one bookable value", () => {
    // `full` was a status until #87, and only two of the nine places that
    // asked about fullness honoured it. Fullness is computed now.
    expect(SCHEDULE_STATUSES).toEqual(["open", "closed", "cancelled"]);
    expect(BOOKABLE_SCHEDULE_STATUS).toBe("open");
  });
});

describe("seatsRemaining", () => {
  it("counts the seats the class would still admit", () => {
    expect(seatsRemaining({ capacity: 8, bookedCount: 5 })).toBe(3);
    expect(seatsRemaining({ capacity: 8, bookedCount: 8 })).toBe(0);
  });

  it("never goes negative on a class that is somehow oversold", () => {
    expect(seatsRemaining({ capacity: 8, bookedCount: 9 })).toBe(0);
  });
});

describe("isScheduleFull", () => {
  it("is fullness derived from occupancy, whatever the status says", () => {
    expect(isScheduleFull({ capacity: 8, bookedCount: 8 })).toBe(true);
    expect(isScheduleFull({ capacity: 8, bookedCount: 7 })).toBe(false);
  });
});

describe("isOpenToBookings", () => {
  it("is true only for the open status", () => {
    expect(isOpenToBookings({ status: "open" })).toBe(true);
    expect(isOpenToBookings({ status: "closed" })).toBe(false);
    expect(isOpenToBookings({ status: "cancelled" })).toBe(false);
  });

  it("treats a status it has never heard of as not open", () => {
    // Bookability fails closed: a status added to the enum without being
    // thought about here refuses bookings rather than quietly admitting them.
    expect(isOpenToBookings({ status: "full" })).toBe(false);
    expect(isOpenToBookings({ status: "" })).toBe(false);
  });
});

describe("canTakeBooking", () => {
  it("wants a class that is open and has a seat", () => {
    expect(
      canTakeBooking({ status: "open", capacity: 8, bookedCount: 7 }),
    ).toBe(true);
  });

  it("refuses a full class", () => {
    expect(
      canTakeBooking({ status: "open", capacity: 8, bookedCount: 8 }),
    ).toBe(false);
  });

  it("refuses a class Gabrielle has closed, seats or no seats", () => {
    // The live bug this decision closes: a class marked full by hand had
    // seven of eight seats taken and was booked anyway.
    expect(
      canTakeBooking({ status: "closed", capacity: 8, bookedCount: 0 }),
    ).toBe(false);
  });

  it("refuses a cancelled class", () => {
    expect(
      canTakeBooking({ status: "cancelled", capacity: 8, bookedCount: 0 }),
    ).toBe(false);
  });
});
