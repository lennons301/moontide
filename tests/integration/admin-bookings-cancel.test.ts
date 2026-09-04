import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/admin/bookings/route";
import { db } from "@/lib/db";
import { bookings, bundles, schedules } from "@/lib/db/schema";
import {
  createBooking,
  createBundle,
  createSchedule,
} from "./support/factories";

// The route checks the session on every request. Who is asking is settled in
// tests/admin/routes-are-protected.test.ts; here it is Gabrielle, so that the
// rows are what the test is about.
vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

/**
 * A whole route against a real database: request in, rows out. The mocked
 * equivalent in `tests/admin/bookings.test.ts` asserts which statements were
 * issued and in what order; this asserts what the bundle and the class look
 * like afterwards, which is what Gabrielle sees.
 */

function cancel(id: number) {
  return PUT(
    new Request("http://localhost/api/admin/bookings", {
      method: "PUT",
      body: JSON.stringify({ id, status: "cancelled" }),
    }),
  );
}

async function readBundle(id: number) {
  const [row] = await db.select().from(bundles).where(eq(bundles.id, id));
  return row;
}

describe("cancelling a bundle-funded booking", () => {
  it("gives the credit back, frees the seat and cancels the booking", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 4 });
    const bundle = await createBundle({ creditsTotal: 6, creditsRemaining: 2 });
    const booking = await createBooking({
      scheduleId: schedule.id,
      bundleId: bundle.id,
    });

    const response = await cancel(booking.id);

    expect(response.status).toBe(200);
    expect((await readBundle(bundle.id)).creditsRemaining).toBe(3);
    const [seat] = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, schedule.id));
    expect(seat.bookedCount).toBe(3);
    const [cancelled] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(cancelled.status).toBe("cancelled");
  });

  it("brings a spent bundle back to life", async () => {
    const bundle = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 0,
      status: "exhausted",
    });
    const booking = await createBooking({ bundleId: bundle.id });

    await cancel(booking.id);

    expect(await readBundle(bundle.id)).toMatchObject({
      creditsRemaining: 1,
      status: "active",
    });
  });

  it("never hands back more credits than the bundle was sold with", async () => {
    const bundle = await createBundle({ creditsTotal: 6, creditsRemaining: 6 });
    const booking = await createBooking({ bundleId: bundle.id });

    await cancel(booking.id);

    expect((await readBundle(bundle.id)).creditsRemaining).toBe(6);
  });
});

describe("cancelling a released booking", () => {
  it("does not free the seat a second time", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 2 });
    const booking = await createBooking({
      scheduleId: schedule.id,
      status: "released",
      releasedAt: new Date(),
    });

    await cancel(booking.id);

    const [seat] = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, schedule.id));
    expect(seat.bookedCount).toBe(2);
  });
});
