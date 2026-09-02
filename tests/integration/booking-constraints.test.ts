import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bookings, waitlistEntries } from "@/lib/db/schema";
import { violatedConstraint } from "./support/constraints";
import { createBooking, createSchedule } from "./support/factories";

/**
 * The indexes that are the last line of defence against double booking. No
 * mocked test can reach them: they live in Postgres, not in the handlers.
 */

describe("bookings_schedule_email_active_idx", () => {
  it("refuses a second active booking for the same customer on the same class", async () => {
    const schedule = await createSchedule();
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
    });

    expect(
      await violatedConstraint(
        createBooking({
          scheduleId: schedule.id,
          customerEmail: "ada@example.com",
        }),
      ),
    ).toBe("bookings_schedule_email_active_idx");
  });

  it("counts a held seat as an active booking", async () => {
    const schedule = await createSchedule();
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
      status: "held",
    });

    expect(
      await violatedConstraint(
        createBooking({
          scheduleId: schedule.id,
          customerEmail: "ada@example.com",
        }),
      ),
    ).toBe("bookings_schedule_email_active_idx");
  });

  it("lets the customer book again once the first booking is cancelled", async () => {
    const schedule = await createSchedule();
    const first = await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
    });

    await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, first.id));
    const second = await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
    });

    expect(second.status).toBe("confirmed");
  });

  it("does not stand between two customers, or between two classes", async () => {
    const schedule = await createSchedule();
    const otherSchedule = await createSchedule();
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
    });

    await expect(
      createBooking({
        scheduleId: schedule.id,
        customerEmail: "grace@example.com",
      }),
    ).resolves.toBeDefined();
    await expect(
      createBooking({
        scheduleId: otherSchedule.id,
        customerEmail: "ada@example.com",
      }),
    ).resolves.toBeDefined();
  });
});

describe("waitlist_schedule_email_idx", () => {
  it("keeps one waiting-list entry per customer per class", async () => {
    const schedule = await createSchedule();
    await db.insert(waitlistEntries).values({
      scheduleId: schedule.id,
      customerName: "Ada",
      customerEmail: "ada@example.com",
    });

    expect(
      await violatedConstraint(
        db.insert(waitlistEntries).values({
          scheduleId: schedule.id,
          customerName: "Ada",
          customerEmail: "ada@example.com",
        }),
      ),
    ).toBe("waitlist_schedule_email_idx");
  });
});
