import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import {
  claimSeat,
  forceClaimSeat,
  releaseSeat,
  releaseSeats,
} from "@/lib/schedule-occupancy";
import { createSchedule } from "./support/factories";

/**
 * The occupancy module against a real Postgres. The mocked suite in
 * `tests/lib/schedule-occupancy.test.ts` can only assert the shape of the
 * statements; these assert the number in the column afterwards, and cover the
 * two things a mock cannot reach: the `GREATEST` clamp, which nothing else ever
 * executes, and what two simultaneous claims on one seat actually do.
 */

async function bookedCount(scheduleId: number): Promise<number> {
  return (await occupancy(scheduleId)).bookedCount;
}

async function occupancy(
  scheduleId: number,
): Promise<{ bookedCount: number; capacity: number }> {
  const [row] = await db
    .select({
      bookedCount: schedules.bookedCount,
      capacity: schedules.capacity,
    })
    .from(schedules)
    .where(eq(schedules.id, scheduleId));
  return row;
}

describe("claimSeat", () => {
  it("takes one seat per claim", async () => {
    const schedule = await createSchedule({ capacity: 8 });

    for (let i = 0; i < 4; i += 1) {
      await expect(claimSeat(db, schedule.id)).resolves.toEqual({
        claimed: true,
      });
    }

    expect(await bookedCount(schedule.id)).toBe(4);
  });

  it("refuses the claim that would exceed capacity, and takes no seat", async () => {
    const schedule = await createSchedule({ capacity: 2, bookedCount: 2 });

    await expect(claimSeat(db, schedule.id)).resolves.toEqual({
      claimed: false,
    });

    expect(await bookedCount(schedule.id)).toBe(2);
  });

  it.each([
    "closed",
    "cancelled",
  ] as const)("refuses a %s class, however many seats it has, and takes none", async (status) => {
    // The other half of the guard, and the bug behind #87: a class Gabrielle
    // had closed by hand had seats to spare and every booking path took one,
    // because this only ever looked at capacity. No mock can show it — the
    // refusal is the UPDATE matching no row.
    const schedule = await createSchedule({
      capacity: 8,
      bookedCount: 1,
      status,
    });

    await expect(claimSeat(db, schedule.id)).resolves.toEqual({
      claimed: false,
    });

    expect(await bookedCount(schedule.id)).toBe(1);
  });

  it("lets exactly one of several simultaneous claims take the last seat", async () => {
    const schedule = await createSchedule({ capacity: 5, bookedCount: 4 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimSeat(db, schedule.id)),
    );

    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(await bookedCount(schedule.id)).toBe(5);
  });
});

describe("forceClaimSeat", () => {
  it("raises capacity with the seat when the class is already full", async () => {
    const schedule = await createSchedule({ capacity: 3, bookedCount: 3 });

    await expect(forceClaimSeat(db, schedule.id)).resolves.toEqual({
      capacityRaised: true,
    });

    // The customer is charged, so the seat is theirs; the class admits it
    // rather than recording occupancy the CHECK constraint forbids.
    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 4,
      capacity: 4,
    });
  });

  it("leaves the capacity Gabrielle set alone while there is room", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 2 });

    await expect(forceClaimSeat(db, schedule.id)).resolves.toEqual({
      capacityRaised: false,
    });

    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 3,
      capacity: 8,
    });
  });

  it("seats a paid customer on a class closed since they started paying", async () => {
    // The one path that does not ask whether the class is open: the money is
    // already taken, so the seat is theirs. Capacity is untouched, and no
    // raise is reported — there was room all along.
    const schedule = await createSchedule({
      capacity: 8,
      bookedCount: 2,
      status: "closed",
    });

    await expect(forceClaimSeat(db, schedule.id)).resolves.toEqual({
      capacityRaised: false,
    });

    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 3,
      capacity: 8,
    });
  });

  it("takes the last seat without raising capacity", async () => {
    const schedule = await createSchedule({ capacity: 4, bookedCount: 3 });

    await expect(forceClaimSeat(db, schedule.id)).resolves.toEqual({
      capacityRaised: false,
    });

    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 4,
      capacity: 4,
    });
  });

  it("writes nothing for a schedule that no longer exists", async () => {
    await expect(forceClaimSeat(db, 424242)).resolves.toEqual({
      capacityRaised: false,
    });
  });
});

describe("releaseSeats", () => {
  it("frees several seats in one statement", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 6 });

    await releaseSeats(db, schedule.id, 3);

    expect(await bookedCount(schedule.id)).toBe(3);
  });

  it("clamps at zero rather than letting occupancy go negative", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 1 });

    await releaseSeats(db, schedule.id, 4);

    expect(await bookedCount(schedule.id)).toBe(0);
  });

  it("writes nothing when there is nothing to free", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 2 });

    await releaseSeats(db, schedule.id, 0);

    expect(await bookedCount(schedule.id)).toBe(2);
  });
});

describe("releaseSeat", () => {
  it("frees one seat, and stops at zero", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 1 });

    await releaseSeat(db, schedule.id);
    await releaseSeat(db, schedule.id);

    expect(await bookedCount(schedule.id)).toBe(0);
  });
});
