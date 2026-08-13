import { describe, expect, it } from "vitest";
import { londonWallClockToUtc } from "@/lib/time/london";

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
