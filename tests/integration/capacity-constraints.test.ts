import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { violatedConstraint } from "./support/constraints";
import { createSchedule } from "./support/factories";

/**
 * The CHECK under occupancy. Every capacity gate in the application is a read,
 * and no mocked test can reach the one thing that refuses a write regardless of
 * which caller made it.
 */

const CONSTRAINT = "schedules_booked_count_within_capacity";

describe("schedules_booked_count_within_capacity", () => {
  it("refuses an update that puts occupancy over capacity", async () => {
    const schedule = await createSchedule({ capacity: 4, bookedCount: 4 });

    expect(
      await violatedConstraint(
        db
          .update(schedules)
          .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
          .where(eq(schedules.id, schedule.id)),
      ),
    ).toBe(CONSTRAINT);

    expect(await bookedCount(schedule.id)).toBe(4);
  });

  it("refuses an insert that starts over capacity", async () => {
    expect(
      await violatedConstraint(createSchedule({ capacity: 8, bookedCount: 9 })),
    ).toBe(CONSTRAINT);
  });

  it("refuses negative occupancy", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 0 });

    expect(
      await violatedConstraint(
        db
          .update(schedules)
          .set({ bookedCount: sql`${schedules.bookedCount} - 1` })
          .where(eq(schedules.id, schedule.id)),
      ),
    ).toBe(CONSTRAINT);
  });

  it("refuses a capacity cut below the seats already taken", async () => {
    // The other way round the same invariant: Gabrielle shrinking a class does
    // not silently orphan the bookings already on it.
    const schedule = await createSchedule({ capacity: 8, bookedCount: 6 });

    expect(
      await violatedConstraint(
        db
          .update(schedules)
          .set({ capacity: 5 })
          .where(eq(schedules.id, schedule.id)),
      ),
    ).toBe(CONSTRAINT);
  });

  it("allows a class filled exactly to capacity", async () => {
    const schedule = await createSchedule({ capacity: 3, bookedCount: 2 });

    await db
      .update(schedules)
      .set({ bookedCount: 3 })
      .where(eq(schedules.id, schedule.id));

    expect(await bookedCount(schedule.id)).toBe(3);
  });
});

async function bookedCount(scheduleId: number): Promise<number> {
  const [row] = await db
    .select({ bookedCount: schedules.bookedCount })
    .from(schedules)
    .where(eq(schedules.id, scheduleId));
  return row.bookedCount;
}
