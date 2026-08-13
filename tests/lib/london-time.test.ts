import { describe, expect, it } from "vitest";
import { londonDateString, londonWallClockToUtc } from "@/lib/time/london";

describe("londonDateString", () => {
  it("reads the London calendar day, not the UTC one", () => {
    // 00:30 BST on 16 June is still 23:30Z on the 15th. A daily job asking
    // "which classes are still to come?" must not skip today's.
    expect(londonDateString(new Date("2026-06-15T23:30:00.000Z"))).toBe(
      "2026-06-16",
    );
  });

  it("agrees with UTC in winter", () => {
    expect(londonDateString(new Date("2026-01-15T23:30:00.000Z"))).toBe(
      "2026-01-15",
    );
  });
});

describe("londonWallClockToUtc", () => {
  it("treats a winter time as UTC", () => {
    // GMT: the wall clock and UTC agree.
    expect(londonWallClockToUtc("2026-01-15", "09:30:00").toISOString()).toBe(
      "2026-01-15T09:30:00.000Z",
    );
  });

  it("is an hour behind the naive reading during British Summer Time", () => {
    // 10:00 in Brighton in June is 09:00Z. Composing it naively in a UTC
    // runtime would put the class start an hour late, which for a seat offer
    // means a deadline that outlives the class.
    expect(londonWallClockToUtc("2026-06-15", "10:00:00").toISOString()).toBe(
      "2026-06-15T09:00:00.000Z",
    );
    expect(
      new Date("2026-06-15T09:00:00.000Z").getTime() -
        Date.UTC(2026, 5, 15, 10, 0, 0),
    ).toBe(-60 * 60 * 1000);
  });

  it("uses the offset in force on each side of the spring clock change", () => {
    // BST begins 01:00 UTC on 29 March 2026.
    expect(londonWallClockToUtc("2026-03-29", "00:30:00").toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
    expect(londonWallClockToUtc("2026-03-29", "09:00:00").toISOString()).toBe(
      "2026-03-29T08:00:00.000Z",
    );
  });

  it("uses the offset in force on each side of the autumn clock change", () => {
    // BST ends 02:00 BST (01:00 UTC) on 25 October 2026.
    expect(londonWallClockToUtc("2026-10-25", "00:30:00").toISOString()).toBe(
      "2026-10-24T23:30:00.000Z",
    );
    expect(londonWallClockToUtc("2026-10-25", "09:00:00").toISOString()).toBe(
      "2026-10-25T09:00:00.000Z",
    );
  });

  it("accepts a time with no seconds", () => {
    expect(londonWallClockToUtc("2026-06-15", "10:00").toISOString()).toBe(
      "2026-06-15T09:00:00.000Z",
    );
  });
});
