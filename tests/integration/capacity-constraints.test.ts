import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/admin/schedules/route";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { claimSeat } from "@/lib/schedule-occupancy";
import { violatedConstraint } from "./support/constraints";
import { createSchedule } from "./support/factories";

// The schedule route checks the session on every request. Who is asking is
// settled in tests/admin/routes-are-protected.test.ts; here it is Gabrielle.
vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

/**
 * The CHECK under occupancy, and the route that must never let Gabrielle meet
 * it. No mocked test can reach the one thing that refuses a write regardless of
 * which caller made it — nor what happens when two writers race for the same
 * invariant, which is the whole reason the capacity guard lives in the UPDATE.
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

/**
 * The other half of the same invariant, through the handler Gabrielle uses. The
 * mocked equivalent in `tests/admin/schedules.test.ts` can only see which
 * statement was issued; these see what the row looks like afterwards, and what
 * a booking landing mid-request actually does.
 */
describe("PUT /api/admin/schedules — capacity", () => {
  function edit(fields: Record<string, unknown>) {
    return PUT(
      new Request("http://localhost/api/admin/schedules", {
        method: "PUT",
        body: JSON.stringify(fields),
      }),
    );
  }

  it("refuses a cut below the seats taken, naming them, and writes nothing", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 6 });

    const response = await edit({ id: schedule.id, capacity: 5 });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("6 seats taken");
    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 6,
      capacity: 8,
    });
  });

  it("cuts capacity down to exactly the seats taken", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 6 });

    const response = await edit({ id: schedule.id, capacity: 6 });

    expect(response.status).toBe(200);
    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 6,
      capacity: 6,
    });
  });

  it("leaves a full class's capacity alone when the box was cleared", async () => {
    // `capacity: 0` is an empty box, read the same way by the guard and the
    // write: the rest of the edit is saved and the CHECK is never reached. The
    // two truthiness checks it replaced agreed here only by accident.
    const schedule = await createSchedule({ capacity: 8, bookedCount: 8 });

    const response = await edit({
      id: schedule.id,
      capacity: 0,
      location: "Studio 2",
    });

    expect(response.status).toBe(200);
    expect(await occupancy(schedule.id)).toEqual({
      bookedCount: 8,
      capacity: 8,
    });
    expect((await response.json()).location).toBe("Studio 2");
  });

  it("refuses rather than faulting when seats are taken as the class shrinks", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 4 });

    // The narrowing and the bookings race for one invariant, each guarded by
    // its own WHERE clause: whichever lands first, the others are refused. A
    // read taken beforehand let the UPDATE through on a count that had moved,
    // and the CHECK turned that into a 500 on the schedule form.
    const [response] = await Promise.all([
      edit({ id: schedule.id, capacity: 4 }),
      claimSeat(db, schedule.id),
      claimSeat(db, schedule.id),
    ]);

    expect([200, 400]).toContain(response.status);
    const row = await occupancy(schedule.id);
    expect(row.bookedCount).toBeLessThanOrEqual(row.capacity);
  });

  it("still answers 404 for a class that is not there", async () => {
    const response = await edit({ id: 424242, capacity: 5 });

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Schedule not found");
  });
});

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
