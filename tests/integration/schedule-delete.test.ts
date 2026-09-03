import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/admin/schedules/route";
import { db } from "@/lib/db";
import { bookings, schedules, waitlistEntries } from "@/lib/db/schema";
import {
  createBooking,
  createSchedule,
  createWaitlistEntry,
} from "./support/factories";

// The route checks the session on every request. Who is asking is settled in
// tests/admin/routes-are-protected.test.ts; here it is Gabrielle, so that the
// rows are what the test is about.
vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

/**
 * Deleting a schedule against a real database.
 *
 * The mocked equivalent in `tests/admin/schedules.test.ts` decides the refusal
 * from a list of statuses; it cannot see the foreign keys, and every row that
 * still points at the schedule is a foreign key. A booking row referencing it
 * refuses the parent delete whatever its status says, so the case this rule
 * exists for — a class set up by mistake whose one booking was cancelled —
 * answered 500 until the rows went with it.
 */

function deleteSchedule(id: number) {
  return DELETE(
    new Request("http://localhost/api/admin/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  );
}

async function readSchedule(id: number) {
  const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
  return row;
}

describe("deleting a schedule nobody holds a place on", () => {
  it("deletes the class and the cancelled booking left on it", async () => {
    const schedule = await createSchedule();
    const booking = await createBooking({
      scheduleId: schedule.id,
      status: "cancelled",
    });

    const response = await deleteSchedule(schedule.id);

    expect(response.status).toBe(200);
    expect(await readSchedule(schedule.id)).toBeUndefined();
    const left = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(left).toHaveLength(0);
  });

  it("deletes a class a released booking was given up on", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 0 });
    await createBooking({
      scheduleId: schedule.id,
      status: "released",
      releasedAt: new Date(),
    });

    expect((await deleteSchedule(schedule.id)).status).toBe(200);
    expect(await readSchedule(schedule.id)).toBeUndefined();
  });

  it("keeps a booking that was moved off it, and forgets where it came from", async () => {
    const from = await createSchedule();
    const to = await createSchedule();
    const moved = await createBooking({
      scheduleId: to.id,
      originalScheduleId: from.id,
      rescheduledAt: new Date(),
    });

    const response = await deleteSchedule(from.id);

    expect(response.status).toBe(200);
    expect(await readSchedule(from.id)).toBeUndefined();
    const [survivor] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, moved.id));
    expect(survivor).toMatchObject({
      scheduleId: to.id,
      status: "confirmed",
      originalScheduleId: null,
    });
  });

  it("deletes a cancelled class whose offer was voided, waiting list and all", async () => {
    // What `voidOffersOnCancellation` leaves behind: the held booking is
    // cancelled, and the waiting-list entry is deliberately kept, still
    // pointing at it.
    const schedule = await createSchedule({ status: "cancelled" });
    const held = await createBooking({
      scheduleId: schedule.id,
      status: "cancelled",
    });
    const waiting = await createWaitlistEntry({
      scheduleId: schedule.id,
      heldBookingId: held.id,
      offerToken: "token-for-a-class-that-is-gone",
    });

    const response = await deleteSchedule(schedule.id);

    expect(response.status).toBe(200);
    expect(await readSchedule(schedule.id)).toBeUndefined();
    const entries = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, waiting.id));
    expect(entries).toHaveLength(0);
  });
});

describe("deleting a schedule someone still holds a place on", () => {
  it.each([
    "confirmed",
    "held",
    "waitlisted",
  ])("refuses a %s booking and leaves every row alone", async (status) => {
    const schedule = await createSchedule();
    const booking = await createBooking({
      scheduleId: schedule.id,
      status: status as "confirmed",
    });

    const response = await deleteSchedule(schedule.id);

    expect(response.status).toBe(409);
    expect(await readSchedule(schedule.id)).toBeDefined();
    const [kept] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(kept.status).toBe(status);
  });

  it("refuses when one booking is cancelled and another is not", async () => {
    const schedule = await createSchedule();
    const cancelled = await createBooking({
      scheduleId: schedule.id,
      status: "cancelled",
    });
    await createBooking({ scheduleId: schedule.id, status: "confirmed" });

    expect((await deleteSchedule(schedule.id)).status).toBe(409);
    // The refusal rolls back: the cancelled booking is still there to be seen.
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, cancelled.id));
    expect(rows).toHaveLength(1);
  });
});
